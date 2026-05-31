import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  TabStopPosition,
  TabStopType,
  Packer,
} from "docx";
import { saveAs } from "file-saver";
import type { ResumeData, SectionKey } from "../types/resume";
import type { TemplateCustomization } from "../types/templates";
import { DEFAULT_CUSTOMIZATION } from "../types/templates";

const cleanColor = (hex?: string) => hex ? hex.replace("#", "") : "2980b9";

// Mapping font sizes (Note: docx size uses half-points, e.g. size 24 = 12pt)
const getFontSizes = (fontSize?: "small" | "medium" | "large") => {
  switch (fontSize) {
    case "small":
      return { title: 28, heading: 20, body: 20, meta: 18 }; // title: 14pt, heading: 10pt, body: 10pt, meta: 9pt
    case "large":
      return { title: 36, heading: 26, body: 24, meta: 22 }; // title: 18pt, heading: 13pt, body: 12pt, meta: 11pt
    case "medium":
    default:
      return { title: 32, heading: 22, body: 22, meta: 20 }; // title: 16pt, heading: 11pt, body: 11pt, meta: 10pt
  }
};

// Mapping paragraph and section spacing settings
const getSpacing = (
  lineHeight?: "compact" | "normal" | "relaxed",
  sectionSpacing?: "tight" | "normal" | "spacious"
) => {
  let bodyAfter = 40;
  let headAfter = 40;
  switch (lineHeight) {
    case "compact":
      bodyAfter = 20;
      headAfter = 20;
      break;
    case "relaxed":
      bodyAfter = 60;
      headAfter = 60;
      break;
    case "normal":
    default:
      bodyAfter = 40;
      headAfter = 40;
      break;
  }

  let headBefore = 160;
  switch (sectionSpacing) {
    case "tight":
      headBefore = 100;
      break;
    case "spacious":
      headBefore = 240;
      break;
    case "normal":
    default:
      headBefore = 160;
      break;
  }

  return { bodyAfter, headBefore, headAfter };
};

export async function exportToDocx(
  data: ResumeData,
  customization: TemplateCustomization = DEFAULT_CUSTOMIZATION,
): Promise<void> {
  const paragraphs: Paragraph[] = [];
  const font = customization.fontFamily;
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

  const bulletParagraph = (text: string): Paragraph => {
    return new Paragraph({
      bullet: { level: 0 },
      children: [new TextRun({ text, size: sizes.body, font })],
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
    return data.sectionLabels?.[key] || defaultLabel;
  };

  // Header
  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: data.contact.name, bold: true, size: sizes.title, color: primary, font }),
      ],
    }),
  );

  const contactParts: string[] = [];
  if (data.contact.phone) contactParts.push(data.contact.phone);
  if (data.contact.email) contactParts.push(data.contact.email);
  if (data.contact.linkedin) contactParts.push(data.contact.linkedin);
  if (data.contact.github) contactParts.push(data.contact.github);
  if (data.contact.portfolio) contactParts.push(data.contact.portfolio);

  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: contactParts.join(" | "),
          size: sizes.meta,
          color: secondary,
          font,
        }),
      ],
      spacing: { after: spacing.bodyAfter * 2.5 },
    }),
  );

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
        if (data.summary) {
          paragraphs.push(sectionHeading(getSectionLabel("summary", "Summary")), makeLine());
          paragraphs.push(
            new Paragraph({
              children: [new TextRun({ text: data.summary, size: sizes.body, font })],
              spacing: { after: spacing.bodyAfter * 2 },
            }),
          );
        }
        break;

      case "education":
        if (data.education.length > 0) {
          paragraphs.push(sectionHeading(getSectionLabel("education", "Education")), makeLine());
          for (const edu of data.education) {
            paragraphs.push(
              new Paragraph({
                tabStops: [
                  { type: TabStopType.RIGHT, position: TabStopPosition.MAX },
                ],
                children: [
                  new TextRun({ text: edu.university, bold: true, size: sizes.body, font }),
                  new TextRun({ text: `\t${edu.yearRange}`, size: sizes.body, font }),
                ],
              }),
            );
            paragraphs.push(
              new Paragraph({
                tabStops: [
                  { type: TabStopType.RIGHT, position: TabStopPosition.MAX },
                ],
                children: [
                  new TextRun({ text: edu.degree, italics: true, size: sizes.body, font }),
                  new TextRun({
                    text: edu.cgpa ? `\t${edu.cgpa}` : "",
                    size: sizes.body,
                    font,
                  }),
                ],
                spacing: { after: spacing.bodyAfter * 2 },
              }),
            );
          }
        }
        break;

      case "experience":
        if (data.showExperience && data.experience?.length > 0) {
          paragraphs.push(sectionHeading(getSectionLabel("experience", "Experience")), makeLine());
          for (const exp of data.experience) {
            paragraphs.push(
              new Paragraph({
                tabStops: [
                  { type: TabStopType.RIGHT, position: TabStopPosition.MAX },
                ],
                children: [
                  new TextRun({
                    text: `${exp.role} — ${exp.company}`,
                    bold: true,
                    size: sizes.body,
                    font,
                  }),
                  new TextRun({ text: `\t${exp.dateRange}`, size: sizes.body, font }),
                ],
              }),
            );
            if (exp.location) {
              paragraphs.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: exp.location,
                      italics: true,
                      size: sizes.meta,
                      color: secondary,
                      font,
                    }),
                  ],
                }),
              );
            }
            for (const b of exp.bullets) {
              paragraphs.push(bulletParagraph(b));
            }
          }
        }
        break;

      case "projects":
        if (data.projects.length > 0) {
          paragraphs.push(sectionHeading(getSectionLabel("projects", "Projects")), makeLine());
          for (const proj of data.projects) {
            const links: string[] = [];
            if (proj.githubLink) links.push(`Github: ${proj.githubLink}`);
            if (proj.liveLink) links.push(`Live: ${proj.liveLink}`);
            paragraphs.push(
              new Paragraph({
                children: [
                  new TextRun({ text: proj.title, bold: true, size: sizes.body, font }),
                  ...(links.length > 0
                    ? [
                        new TextRun({
                          text: ` | ${links.join(" | ")}`,
                          size: sizes.meta,
                          color: primary,
                          font,
                        }),
                      ]
                    : []),
                ],
              }),
            );
            if (proj.techStack) {
              paragraphs.push(
                new Paragraph({
                  children: [
                    new TextRun({ text: "Tech Stack: ", bold: true, size: sizes.meta, font }),
                    new TextRun({ text: proj.techStack, size: sizes.meta, font }),
                  ],
                }),
              );
            }
            for (const b of proj.bullets) {
              paragraphs.push(bulletParagraph(b));
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
                  new TextRun({
                    text: `${skill.label}: `,
                    bold: true,
                    size: sizes.body,
                    font,
                  }),
                  new TextRun({ text: skill.skills, size: sizes.body, font }),
                ],
                spacing: { after: spacing.bodyAfter },
              }),
            );
          }
        }
        break;

      case "achievements":
        if (data.achievements?.length > 0) {
          paragraphs.push(sectionHeading(getSectionLabel("achievements", "Achievements")), makeLine());
          for (const ach of data.achievements) {
            paragraphs.push(bulletParagraph(ach.text));
          }
        }
        break;

      case "certificates":
        if (data.showCertificates && data.certificates?.length > 0) {
          paragraphs.push(sectionHeading(getSectionLabel("certificates", "Certificates")), makeLine());
          for (const cert of data.certificates) {
            paragraphs.push(
              new Paragraph({
                children: [
                  new TextRun({ text: cert.name, bold: true, size: sizes.body, font }),
                  new TextRun({ text: ` — ${cert.description}`, size: sizes.body, font }),
                  ...(cert.link
                    ? [
                        new TextRun({
                          text: ` (${cert.link})`,
                          size: sizes.meta,
                          color: primary,
                          font,
                        }),
                      ]
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

  const doc = new Document({
    sections: [{ children: paragraphs }],
  });

  const blob = await Packer.toBlob(doc);
  const fileName = data.contact.name
    ? `${data.contact.name.replace(/\s+/g, "_")}_Resume.docx`
    : "Resume.docx";
  saveAs(blob, fileName);
}
