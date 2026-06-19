import './globals.css';
import React from 'react';

export const metadata = {
  title: 'ToqueHub - Marché Alimentaire RNM',
  description: 'Suivi en temps réel des cotations alimentaires de FranceAgriMer',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>
        {children}
      </body>
    </html>
  );
}
