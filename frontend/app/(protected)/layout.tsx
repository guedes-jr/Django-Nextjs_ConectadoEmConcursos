import { AuthLayout } from "@/components/auth/AuthLayout";
import { AppHeader } from "@/components/layout/AppHeader";
import { BackToTop } from "@/components/layout/BackToTop";
import { FloatingThemeButton } from "@/components/layout/FloatingThemeButton";
import "@excalidraw/excalidraw/index.css";

export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthLayout>
      <AppHeader />
      {children}
      <BackToTop />
      <FloatingThemeButton />
    </AuthLayout>
  );
}
