import { Suspense } from "react";
import LoginForm from "./login-form";

export const metadata = {
  title: "Вход — Балона Враца",
};

export default function LoginPage() {
  return (
    <div className="flex min-h-[calc(100vh-56px)] items-center justify-center px-4 py-12">
      <Suspense
        fallback={
          <div className="text-gray-400 text-sm">Зареждане...</div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
