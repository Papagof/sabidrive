/** Small school-branding logo dropped into an authenticated page's existing header row. Renders nothing when the school has no logo. */
export function SchoolLogo({ logoUrl }: { logoUrl: string | null }) {
  if (!logoUrl) return null;
  return <img src={logoUrl} alt="" className="h-8 w-8 rounded object-contain" />;
}
