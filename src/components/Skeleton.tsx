/* ─── Skeleton Loaders ─────────────────────────────────
   Animated placeholder UI shown while lazy-loaded
   components are being fetched.
   ────────────────────────────────────────────────────── */

import React from "react";

interface SkeletonProps {
  width?: string;
  height?: string;
  borderRadius?: string;
  style?: React.CSSProperties;
}

const shimmerStyle: React.CSSProperties = {
  background: "linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%)",
  backgroundSize: "200% 100%",
  animation: "skeleton-shimmer 1.5s ease-in-out infinite",
  borderRadius: "6px",
};

export function SkeletonBlock({
  width = "100%",
  height = "16px",
  borderRadius = "6px",
  style,
}: SkeletonProps) {
  return (
    <div
      style={{
        ...shimmerStyle,
        width,
        height,
        borderRadius,
        ...style,
      }}
    />
  );
}

/**
 * Skeleton for the Resume Editor panel.
 */
export function EditorSkeleton() {
  return (
    <div
      style={{
        padding: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      <SkeletonBlock height="32px" width="60%" />
      <SkeletonBlock height="20px" width="40%" />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          marginTop: "8px",
        }}
      >
        <SkeletonBlock height="14px" width="100%" />
        <SkeletonBlock height="14px" width="90%" />
        <SkeletonBlock height="14px" width="95%" />
      </div>
      <SkeletonBlock height="80px" width="100%" borderRadius="8px" />
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <SkeletonBlock height="24px" width="30%" />
        <SkeletonBlock height="14px" width="100%" />
        <SkeletonBlock height="14px" width="85%" />
        <SkeletonBlock height="14px" width="92%" />
      </div>
      <SkeletonBlock height="60px" width="100%" borderRadius="8px" />
      <div style={{ display: "flex", gap: "8px" }}>
        <SkeletonBlock height="32px" width="80px" borderRadius="16px" />
        <SkeletonBlock height="32px" width="100px" borderRadius="16px" />
        <SkeletonBlock height="32px" width="70px" borderRadius="16px" />
      </div>
    </div>
  );
}

/**
 * Skeleton for the Resume Preview / Template panel.
 */
export function PreviewSkeleton() {
  return (
    <div
      style={{
        padding: "40px 50px",
        background: "white",
        border: "1px solid #e5e7eb",
        borderRadius: "4px",
        minHeight: "400px",
        display: "flex",
        flexDirection: "column",
        gap: "14px",
      }}
    >
      {/* Name */}
      <SkeletonBlock height="28px" width="40%" />
      {/* Contact row */}
      <div style={{ display: "flex", gap: "12px" }}>
        <SkeletonBlock height="12px" width="120px" />
        <SkeletonBlock height="12px" width="150px" />
        <SkeletonBlock height="12px" width="100px" />
      </div>
      {/* Divider */}
      <SkeletonBlock height="2px" width="100%" borderRadius="1px" />
      {/* Summary */}
      <SkeletonBlock height="12px" width="100%" />
      <SkeletonBlock height="12px" width="95%" />
      <SkeletonBlock height="12px" width="80%" />
      {/* Section header */}
      <SkeletonBlock height="18px" width="25%" style={{ marginTop: "12px" }} />
      <SkeletonBlock height="2px" width="100%" borderRadius="1px" />
      {/* Items */}
      <SkeletonBlock height="14px" width="60%" />
      <SkeletonBlock height="12px" width="100%" />
      <SkeletonBlock height="12px" width="90%" />
      <SkeletonBlock height="12px" width="85%" />
      {/* Section header */}
      <SkeletonBlock height="18px" width="20%" style={{ marginTop: "12px" }} />
      <SkeletonBlock height="2px" width="100%" borderRadius="1px" />
      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
        <SkeletonBlock height="20px" width="70px" borderRadius="10px" />
        <SkeletonBlock height="20px" width="90px" borderRadius="10px" />
        <SkeletonBlock height="20px" width="60px" borderRadius="10px" />
        <SkeletonBlock height="20px" width="80px" borderRadius="10px" />
        <SkeletonBlock height="20px" width="65px" borderRadius="10px" />
      </div>
    </div>
  );
}
