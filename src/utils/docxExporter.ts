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

function makeLine(): Paragraph {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: "999999" } },
    spacing: { after: 80 },
  });
}

function bulletParagraph(text: string): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    children: [new TextRun({ text, size: 20 })],
    spacing: { after: 40 },
  });
}

function sectionHeading(title: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [
      new TextRun({
        text: title.toUpperCase(),
        bold: true,
        size: 22,
        color: "2980b9",
      }),
    ],
    spacing: { before: 160, after: 40 },
  });
}

export async function exportToDocx(data: ResumeData): Promise<void> {
  const paragraphs: Paragraph[] = [];

  // Header
  paragraphs.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: data.contact.name, bold: true, size: 32 }),
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
          size: 18,
          color: "666666",
        }),
      ],
      spacing: { after: 100 },
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
          paragraphs.push(sectionHeading("Summary"), makeLine());
          paragraphs.push(
            new Paragraph({
              children: [new TextRun({ text: data.summary, size: 20 })],
              spacing: { after: 80 },
            }),
          );
        }
        break;

      case "education":
        if (data.education.length > 0) {
          paragraphs.push(sectionHeading("Education"), makeLine());
          for (const edu of data.education) {
            paragraphs.push(
              new Paragraph({
                tabStops: [
                  { type: TabStopType.RIGHT, position: TabStopPosition.MAX },
                ],
                children: [
                  new TextRun({ text: edu.university, bold: true, size: 20 }),
                  new TextRun({ text: `\t${edu.yearRange}`, size: 20 }),
                ],
              }),
            );
            paragraphs.push(
              new Paragraph({
                tabStops: [
                  { type: TabStopType.RIGHT, position: TabStopPosition.MAX },
                ],
                children: [
                  new TextRun({ text: edu.degree, italics: true, size: 20 }),
                  new TextRun({
                    text: edu.cgpa ? `\t${edu.cgpa}` : "",
                    size: 20,
                  }),
                ],
                spacing: { after: 80 },
              }),
            );
          }
        }
        break;

      case "experience":
        if (data.showExperience && data.experience?.length > 0) {
          paragraphs.push(sectionHeading("Experience"), makeLine());
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
                    size: 20,
                  }),
                  new TextRun({ text: `\t${exp.dateRange}`, size: 20 }),
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
                      size: 18,
                      color: "666666",
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
          paragraphs.push(sectionHeading("Projects"), makeLine());
          for (const proj of data.projects) {
            const links: string[] = [];
            if (proj.githubLink) links.push(`Github: ${proj.githubLink}`);
            if (proj.liveLink) links.push(`Live: ${proj.liveLink}`);
            paragraphs.push(
              new Paragraph({
                children: [
                  new TextRun({ text: proj.title, bold: true, size: 20 }),
                  ...(links.length > 0
                    ? [
                        new TextRun({
                          text: ` | ${links.join(" | ")}`,
                          size: 18,
                          color: "2980b9",
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
                    new TextRun({ text: "Tech Stack: ", bold: true, size: 18 }),
                    new TextRun({ text: proj.techStack, size: 18 }),
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
          paragraphs.push(sectionHeading("Skills"), makeLine());
          for (const skill of data.skills) {
            paragraphs.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: `${skill.label}: `,
                    bold: true,
                    size: 20,
                  }),
                  new TextRun({ text: skill.skills, size: 20 }),
                ],
                spacing: { after: 40 },
              }),
            );
          }
        }
        break;

      case "achievements":
        if (data.achievements?.length > 0) {
          paragraphs.push(sectionHeading("Achievements"), makeLine());
          for (const ach of data.achievements) {
            paragraphs.push(bulletParagraph(ach.text));
          }
        }
        break;

      case "certificates":
        if (data.showCertificates && data.certificates?.length > 0) {
          paragraphs.push(sectionHeading("Certificates"), makeLine());
          for (const cert of data.certificates) {
            paragraphs.push(
              new Paragraph({
                children: [
                  new TextRun({ text: cert.name, bold: true, size: 20 }),
                  new TextRun({ text: ` — ${cert.description}`, size: 20 }),
                  ...(cert.link
                    ? [
                        new TextRun({
                          text: ` (${cert.link})`,
                          size: 18,
                          color: "2980b9",
                        }),
                      ]
                    : []),
                ],
                spacing: { after: 40 },
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
