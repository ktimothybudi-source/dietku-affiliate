import "./globals.css";

export const metadata = {
  title: "DietKu Affiliates",
  description: "Standalone affiliate growth platform for DietKu",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
