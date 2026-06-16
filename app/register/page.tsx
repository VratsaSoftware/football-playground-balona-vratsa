import RegisterForm from "./register-form";

export const metadata = {
  title: "Регистрация — Балона Wraца",
};

export default function RegisterPage() {
  return (
    <div className="flex min-h-[calc(100vh-56px)] items-center justify-center px-4 py-12">
      <RegisterForm />
    </div>
  );
}
