/**
 * AI prompt to detect the visual template style from raw resume text.
 *
 * The AI infers layout/style from the structure, formatting cues, and
 * organization visible in the extracted text.
 */
export function buildTemplateDetectorPrompt(resumeText: string): string {
  return `You are an expert resume design analyst. Analyze the following resume text (extracted from a PDF) and infer the most likely visual template style used in the original document.

Based on the text structure, formatting patterns, section organization, and content density, determine:

1. **templateId**: Which of these 5 templates best matches the original?
   - "classic" — Traditional, clean lines, standard section headers (ALL CAPS), straightforward layout
   - "modern" — Contemporary design, colored headers, uses accent colors, may have borders or backgrounds
   - "minimal" — Clean, lots of whitespace, simple formatting, elegant and sparse
   - "creative" — Bold, sidebar layout, uses icons/symbols, decorative elements, unique structure
   - "ats" — Plain text optimized, no columns, simple bullet points, maximum parsability

2. **primaryColor**: A hex color (e.g., "#2980b9") that likely matches the accent/heading color. Infer from:
   - If sections use standard black headers → "#2c3e50" (dark)
   - If the layout seems modern/colorful → suggest an appropriate color
   - Default to "#2980b9" (blue) if uncertain

3. **secondaryColor**: A darker shade of the primary color

4. **fontFamily**: Best matching font from: "Inter", "Georgia", "Merriweather", "Roboto", "Lato", "Playfair Display"
   - Serif-looking text → "Georgia" or "Merriweather" or "Playfair Display"
   - Clean sans-serif → "Inter", "Roboto", or "Lato"

5. **fontSize**: "small", "medium", or "large" — infer from content density:
   - Very dense, lots of content → "small"
   - Typical → "medium"
   - Sparse, fewer items → "large"

6. **lineHeight**: "compact", "normal", or "relaxed"

7. **sectionSpacing**: "tight", "normal", or "spacious"

8. **confidence**: A number 0-100 indicating how confident you are about the style detection

9. **styleName**: A short human-readable name for the detected style (e.g., "Modern Blue", "Classic Dark", "Minimal Serif")

Respond with ONLY valid JSON, no explanation, no code fences:

{
  "templateId": "classic",
  "primaryColor": "#2980b9",
  "secondaryColor": "#1a5276",
  "fontFamily": "Inter",
  "fontSize": "medium",
  "lineHeight": "normal",
  "sectionSpacing": "normal",
  "confidence": 75,
  "styleName": "Classic Blue"
}

Resume text to analyze:
---
${resumeText.substring(0, 4000)}
---`;
}
