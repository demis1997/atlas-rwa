import type { Metadata } from "next";
import "./style.css";
export const metadata: Metadata = {
  title: "Atlas RWA · Securities terminal",
  description: "Local synthetic institutional tokenization reference",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
