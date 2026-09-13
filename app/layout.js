import './globals.css';
import { ThemeProvider } from '../lib/themeContext';

export const metadata = {
  title: 'Noïr Works Studio',
  description:
    'Prompt Generator & Metadata Generator untuk Adobe Stock, ditenagai Claude (Anthropic) — Pixinvite / Invitessa internal tool.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
