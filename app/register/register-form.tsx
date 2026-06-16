"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";

type FieldError = string | undefined;

interface FormErrors {
  email?: FieldError;
  password?: FieldError;
  phone?: FieldError;
  teamName?: FieldError;
  general?: string;
}

export default function RegisterForm() {
  const router = useRouter();

  const [form, setForm] = useState({
    email: "",
    password: "",
    phone: "",
    teamName: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [loading, setLoading] = useState(false);

  function setField(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined, general: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setLoading(true);

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          phone: form.phone,
          teamName: form.teamName || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.details) {
          setErrors(data.details as FormErrors);
        } else {
          setErrors({ general: data.error ?? "Грешка при регистрация." });
        }
        return;
      }

      router.push("/login?registered=1");
    } catch {
      setErrors({ general: "Грешка при свързване. Моля, опитайте отново." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <span className="text-5xl">⚽</span>
        <h1 className="text-2xl font-bold mt-3 text-gray-900">
          Създайте профил
        </h1>
        <p className="text-gray-500 mt-1 text-sm">Балона Враца — Резервации</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 space-y-5"
      >
        {errors.general && (
          <div className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-lg border border-red-200">
            {errors.general}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Имейл <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(e) => setField("email", e.target.value)}
            className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition ${
              errors.email ? "border-red-400 bg-red-50" : "border-gray-300"
            }`}
            placeholder="вашият@имейл.com"
          />
          {errors.email && (
            <p className="text-red-600 text-xs mt-1">{errors.email}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Телефон <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            required
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => setField("phone", e.target.value)}
            className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition ${
              errors.phone ? "border-red-400 bg-red-50" : "border-gray-300"
            }`}
            placeholder="+359 888 123 456"
          />
          {errors.phone && (
            <p className="text-red-600 text-xs mt-1">{errors.phone}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Парола <span className="text-red-500">*</span>
          </label>
          <input
            type="password"
            required
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setField("password", e.target.value)}
            className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition ${
              errors.password ? "border-red-400 bg-red-50" : "border-gray-300"
            }`}
            placeholder="Поне 8 символа"
          />
          {errors.password && (
            <p className="text-red-600 text-xs mt-1">{errors.password}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Име на отбор{" "}
            <span className="text-gray-400 font-normal">(незадължително)</span>
          </label>
          <input
            type="text"
            autoComplete="organization"
            value={form.teamName}
            onChange={(e) => setField("teamName", e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition"
            placeholder="напр. ФК Балона"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-600 text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Регистрация..." : "Регистрирай се"}
        </button>

        <p className="text-center text-sm text-gray-500">
          Вече имате профил?{" "}
          <Link
            href="/login"
            className="text-green-600 hover:text-green-700 font-medium hover:underline"
          >
            Влезте
          </Link>
        </p>
      </form>
    </div>
  );
}
