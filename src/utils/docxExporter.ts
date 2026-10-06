import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  ShadingType,
  TabStopPosition,
  TabStopType,
  ExternalHyperlink,
  Packer,
} from "docx";
import { saveAs } from "file-saver";
import type { ResumeData, SectionKey } from "../types/resume";
import type { TemplateCustomization } from "../types/templates";
import { DEFAULT_CUSTOMIZATION } from "../types/templates";
import { tokenizeText } from "./textFormatter";
import { pruneForExport } from "./exportData";
import { displayUrl, mailtoUrl, safeUrl, telUrl } from "./safeUrl";

const cleanColor = (hex?: string) => hex ? hex.replace("#", "") : "2980b9";

// Mapping font sizes (Note: docx size uses half-points, e.g. size 24 = 12pt)
const getFontSizes = (fontSize?: "xsmall" | "small" | "medium" | "large" | "xlarge") => {
  switch (fontSize) {
    case "xsmall":
      return { title: 26, heading: 18, body: 18, meta: 16 }; // title: 13pt, heading: 9pt, body: 9pt, meta: 8pt
    case "small":
      return { title: 28, heading: 20, body: 20, meta: 18 }; // title: 14pt, heading: 10pt, body: 10pt, meta: 9pt
    case "large":
      return { title: 36, heading: 26, body: 24, meta: 22 }; // title: 18pt, heading: 13pt, body: 12pt, meta: 11pt
    case "xlarge":
      return { title: 40, heading: 30, body: 26, meta: 24 }; // title: 20pt, heading: 15pt, body: 13pt, meta: 12pt
    case "medium":
    default:
      return { title: 32, heading: 22, body: 22, meta: 20 }; // title: 16pt, heading: 11pt, body: 11pt, meta: 10pt
  }
};

// Mapping paragraph and section spacing settings
const PARAGRAPH_AFTER = { compact: 20, normal: 40, relaxed: 60, loose: 80 };
const SECTION_HEAD_BEFORE = {
  tight: 100,
  normal: 160,
  spacious: 240,
  "extra-spacious": 360,
};

const getSpacing = (
  lineHeight?: "compact" | "normal" | "relaxed" | "loose",
  sectionSpacing?: "tight" | "normal" | "spacious" | "extra-spacious"
) => {
  const after = PARAGRAPH_AFTER[lineHeight ?? "normal"] ?? PARAGRAPH_AFTER.normal;
  const headBefore =
    SECTION_HEAD_BEFORE[sectionSpacing ?? "normal"] ?? SECTION_HEAD_BEFORE.normal;

  return { bodyAfter: after, headBefore, headAfter: after };
};


type Inline = TextRun | ExternalHyperlink;

/**
 * Builds the DOCX document for a resume. Pure (no download), so it can be
 * tested. Works on a pruned copy: blank entries, blank bullets and empty
 * sections never reach the file, matching the PDF.
 */
export function buildResumeDocument(
  rawData: ResumeData,
  customization: TemplateCustomization = DEFAULT_CUSTOMIZATION,
): Document {
  const data = pruneForExport(rawData);
  const paragraphs: Paragraph[] = [];
  const family = customization.fontFamily;
  // Hindi / Devanagari and CJK text fall back per script, so name the font for
  // every script slot instead of only the Latin one.
  const font = { ascii: family, hAnsi: family, eastAsia: family, cs: family };
  const primary = cleanColor(customization.primaryColor);
  const secondary = cleanColor(customization.secondaryColor);
  const sizes = getFontSizes(customization.fontSize);
  const spacing = getSpacing(customization.lineHeight, customization.sectionSpacing);

  const makeLine = (): Paragraph => {
    return new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: primary } },
      spacing: { after: spacing.bodyAfter * 2 },
    });
  };

  interface RunStyle {
    bold?: boolean;
    italics?: boolean;
    color?: string;
  }

  /** Every text field goes through here so **bold**, *italic* and ==highlight== survive. */
  const textToRuns = (text: string, size: number, base: RunStyle = {}): TextRun[] => {
    if (!text) return [];
    return tokenizeText(text).map(
      (t) =>
        new TextRun({
          text: t.text,
          size,
          font,
          color: base.color,
          bold: t.bold || base.bold || undefined,
          italics: t.italic || base.italics || undefined,
          shading: t.highlight
            ? { type: ShadingType.CLEAR, fill: "FFF3CD", color: "auto" }
            : undefined,
        }),
    );
  };

  const linkRun = (href: string, label: string, size: number): ExternalHyperlink =>
    new ExternalHyperlink({
      link: href,
      children: [
        new TextRun({ text: label, size, font, color: primary, underline: {} }),
      ],
    });

  const plain = (text: string, size: number, style: RunStyle = {}): TextRun =>
    new TextRun({ text, size, font, ...style });

  const bulletParagraph = (children: Inline[]): Paragraph => {
    return new Paragraph({
      bullet: { level: 0 },
      children,
      spacing: { after: spacing.bodyAfter },
    });
  };

  const sectionHeading = (title: string): Paragraph => {
    return new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [
        new TextRun({
          text: title.toUpperCase(),
          bold: true,
          size: sizes.heading,
          color: primary,
          font,
        }),
      ],
      spacing: { before: spacing.headBefore, after: spacing.headAfter },
    });
  };

  const getSectionLabel = (key: SectionKey, defaultLabel: string): string => {
    return data.sectionLabels?.[key]?.trim() || defaultLabel;
  };

  const rightTab = [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }];

  // Header
  if (data.contact.name.trim()) {
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({ text: data.contact.name, bold: true, size: sizes.title, color: primary, font }),
        ],
      }),
    );
  }

  const contactParts: Inline[][] = [];
  if (data.contact.phone.trim()) {
    const tel = telUrl(data.contact.phone);
    contactParts.push([
      tel
        ? linkRun(tel, data.contact.phone.trim(), sizes.meta)
        : plain(data.contact.phone.trim(), sizes.meta, { color: secondary }),
    ]);
  }
  if (data.contact.email.trim()) {
    const mail = mailtoUrl(data.contact.email);
    contactParts.push([
      mail
        ? linkRun(mail, data.contact.email.trim(), sizes.meta)
        : plain(data.contact.email.trim(), sizes.meta, { color: secondary }),
    ]);
  }
  for (const field of ["linkedin", "github", "portfolio"] as const) {
    const href = safeUrl(data.contact[field]);
    if (href) contactParts.push([linkRun(href, displayUrl(href), sizes.meta)]);
  }

  if (contactParts.length > 0) {
    const children: Inline[] = [];
    contactParts.forEach((part, i) => {
      if (i > 0) children.push(plain(" | ", sizes.meta, { color: secondary }));
      children.push(...part);
    });
    paragraphs.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children,
        spacing: { after: spacing.bodyAfter * 2.5 },
      }),
    );
  }

  const order: SectionKey[] = data.sectionOrder?.length
    ? data.sectionOrder
    : [
        "summary",
        "education",
        "experience",
        "projects",
        "skills",
        "achievements",
        "certificates",
      ];

  for (const section of order) {
    switch (section) {
      case "summary":
        if (data.summary.trim()) {
          paragraphs.push(sectionHeading(getSectionLabel("summary", "Summary")), makeLine());
          paragraphs.push(
            new Paragraph({
              children: textToRuns(data.summary, sizes.body),
              spacing: { after: spacing.bodyAfter * 2 },
            }),
          );
        }
        break;

      case "education":
        if (data.education.length > 0) {
          paragraphs.push(sectionHeading(getSectionLabel("education", "Education")), makeLine());
          for (const edu of data.education) {
            if (edu.university.trim() || edu.yearRange.trim()) {
              paragraphs.push(
                new Paragraph({
                  tabStops: rightTab,
                  children: [
                    ...textToRuns(edu.university, sizes.body, { bold: true }),
                    ...(edu.yearRange.trim() ? [plain(`\t${edu.yearRange}`, sizes.body)] : []),
                  ],
                }),
              );
            }
            if (edu.degree.trim() || edu.cgpa.trim()) {
              paragraphs.push(
                new Paragraph({
                  tabStops: rightTab,
                  children: [
                    ...textToRuns(edu.degree, sizes.body, { italics: true }),
                    ...(edu.cgpa.trim() ? [plain(`\t${edu.cgpa}`, sizes.body)] : []),
                  ],
                  spacing: { after: spacing.bodyAfter * 2 },
                }),
              );
            }
          }
        }
        break;

      case "experience":
        if (data.showExperience && data.experience.length > 0) {
          paragraphs.push(sectionHeading(getSectionLabel("experience", "Experience")), makeLine());
          for (const exp of data.experience) {
            const title: TextRun[] = [
              ...textToRuns(exp.role, sizes.body, { bold: true }),
              ...(exp.role.trim() && exp.company.trim()
                ? [plain(" — ", sizes.body, { bold: true })]
                : []),
              ...textToRuns(exp.company, sizes.body, { bold: true }),
            ];
            if (title.length > 0 || exp.dateRange.trim()) {
              paragraphs.push(
                new Paragraph({
                  tabStops: rightTab,
                  children: [
                    ...title,
                    ...(exp.dateRange.trim() ? [plain(`\t${exp.dateRange}`, sizes.body)] : []),
                  ],
                }),
              );
            }
            if (exp.location.trim()) {
              paragraphs.push(
                new Paragraph({
                  children: textToRuns(exp.location, sizes.meta, {
                    italics: true,
                    color: secondary,
                  }),
                }),
              );
            }
            for (const b of exp.bullets) {
              paragraphs.push(bulletParagraph(textToRuns(b, sizes.body)));
            }
          }
        }
        break;

      case "projects":
        if (data.projects.length > 0) {
          paragraphs.push(sectionHeading(getSectionLabel("projects", "Projects")), makeLine());
          for (const proj of data.projects) {
            const github = safeUrl(proj.githubLink);
            const live = safeUrl(proj.liveLink);
            const header: Inline[] = textToRuns(proj.title, sizes.body, { bold: true });
            const links: Array<[string, string]> = [];
            if (github) links.push(["Github", github]);
            if (live) links.push(["Live Demo", live]);
            links.forEach(([label, href], i) => {
              if (i > 0 || proj.title.trim()) header.push(plain(" | ", sizes.meta));
              header.push(linkRun(href, label, sizes.meta));
            });
            if (header.length > 0) {
              paragraphs.push(new Paragraph({ children: header }));
            }
            if (proj.techStack.trim()) {
              paragraphs.push(
                new Paragraph({
                  children: [
                    plain("Tech Stack: ", sizes.meta, { bold: true }),
                    ...textToRuns(proj.techStack, sizes.meta),
                  ],
                }),
              );
            }
            for (const b of proj.bullets) {
              paragraphs.push(bulletParagraph(textToRuns(b, sizes.body)));
            }
          }
        }
        break;

      case "skills":
        if (data.skills.length > 0) {
          paragraphs.push(sectionHeading(getSectionLabel("skills", "Skills")), makeLine());
          for (const skill of data.skills) {
            paragraphs.push(
              new Paragraph({
                children: [
                  ...(skill.label.trim()
                    ? [
                        ...textToRuns(skill.label, sizes.body, { bold: true }),
                        plain(skill.skills.trim() ? ": " : ":", sizes.body, { bold: true }),
                      ]
                    : []),
                  ...textToRuns(skill.skills, sizes.body),
                ],
                spacing: { after: spacing.bodyAfter },
              }),
            );
          }
        }
        break;

      case "achievements":
        if (data.achievements.length > 0) {
          paragraphs.push(sectionHeading(getSectionLabel("achievements", "Achievements")), makeLine());
          for (const ach of data.achievements) {
            const link = safeUrl(ach.githubLink);
            paragraphs.push(
              bulletParagraph([
                ...textToRuns(ach.text, sizes.body),
                ...(link
                  ? [plain(" ", sizes.body), linkRun(link, "GitHub link", sizes.meta)]
                  : []),
              ]),
            );
          }
        }
        break;

      case "certificates":
        if (data.showCertificates && data.certificates.length > 0) {
          paragraphs.push(sectionHeading(getSectionLabel("certificates", "Certificates")), makeLine());
          for (const cert of data.certificates) {
            const link = safeUrl(cert.link);
            paragraphs.push(
              new Paragraph({
                children: [
                  ...textToRuns(cert.name, sizes.body, { bold: true }),
                  ...(cert.name.trim() && cert.description.trim()
                    ? [plain(" — ", sizes.body)]
                    : []),
                  ...textToRuns(cert.description, sizes.body),
                  ...(link
                    ? [plain(" ", sizes.body), linkRun(link, "View Certificate", sizes.meta)]
                    : []),
                ],
                spacing: { after: spacing.bodyAfter },
              }),
            );
          }
        }
        break;
    }
  }

  return new Document({
    sections: [{ children: paragraphs }],
  });
}

export async function exportToDocx(
  data: ResumeData,
  customization: TemplateCustomization = DEFAULT_CUSTOMIZATION,
): Promise<void> {
  const doc = buildResumeDocument(data, customization);
  const blob = await Packer.toBlob(doc);
  const name = (data?.contact?.name ?? "").trim();
  const fileName = name ? `${name.replace(/\s+/g, "_")}_Resume.docx` : "Resume.docx";
  saveAs(blob, fileName);
}
