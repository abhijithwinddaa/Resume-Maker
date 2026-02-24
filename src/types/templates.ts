export type TemplateId = "classic" | "modern" | "minimal" | "creative" | "ats";

export interface TemplateCustomization {
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  fontSize: "small" | "medium" | "large";
  lineHeight: "compact" | "normal" | "relaxed";
  sectionSpacing: "tight" | "normal" | "spacious";
}

export interface TemplateInfo {
  id: TemplateId;
  name: string;
  description: string;
  thumbnail: string; // emoji or icon name
}

export const TEMPLATES: TemplateInfo[] = [
  {
    id: "classic",
    name: "Classic",
    description: "Traditional resume layout with clean lines",
    thumbnail: "📄",
  },
  {
    id: "modern",
    name: "Modern",
    description: "Contemporary design with accent colors",
    thumbnail: "🎨",
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Clean and simple with plenty of whitespace",
    thumbnail: "✨",
  },
  {
    id: "creative",
    name: "Creative",
    description: "Bold design with sidebar layout",
    thumbnail: "🚀",
  },
  {
    id: "ats",
    name: "ATS-Friendly",
    description: "Optimized for applicant tracking systems",
    thumbnail: "🤖",
  },
];

export const DEFAULT_CUSTOMIZATION: TemplateCustomization = {
  primaryColor: "#2980b9",
  secondaryColor: "#1a5276",
  fontFamily: "Inter",
  fontSize: "medium",
  lineHeight: "normal",
  sectionSpacing: "normal",
};

export const FONT_OPTIONS = [
  { id: "Inter", name: "Inter" },
  { id: "Georgia", name: "Georgia (Serif)" },
  { id: "Merriweather", name: "Merriweather" },
  { id: "Roboto", name: "Roboto" },
  { id: "Lato", name: "Lato" },
  { id: "Playfair Display", name: "Playfair Display" },
];

export const COLOR_PRESETS = [
  { name: "Blue", primary: "#2980b9", secondary: "#1a5276" },
  { name: "Green", primary: "#27ae60", secondary: "#1e8449" },
  { name: "Purple", primary: "#8e44ad", secondary: "#6c3483" },
  { name: "Red", primary: "#c0392b", secondary: "#922b21" },
  { name: "Teal", primary: "#1abc9c", secondary: "#148f77" },
  { name: "Dark", primary: "#2c3e50", secondary: "#1a252f" },
];
