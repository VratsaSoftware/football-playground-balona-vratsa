import Link from "next/link";
import { auth } from "@/auth";

export default async function HomePage() {
  const session = await auth();

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] px-4 py-16">
      <div className="text-center max-w-lg">
        <div className="text-6xl mb-5">⚽</div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Балона Враца
        </h1>
        <p className="text-lg text-gray-500 mb-8">
          Резервирайте час на вашето любимо футболно игрище
        </p>

        {session?.user ? (
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/account"
              className="bg-green-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-green-700 transition-colors"
            >
              Моите резервации
            </Link>
            {session.user.role === "ADMIN" && (
              <Link
                href="/admin"
                className="bg-gray-900 text-white px-6 py-3 rounded-xl font-semibold hover:bg-gray-800 transition-colors"
              >
                Администрация
              </Link>
            )}
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/register"
              className="bg-green-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-green-700 transition-colors"
            >
              Регистрирайте се
            </Link>
            <Link
              href="/login"
              className="bg-white text-gray-700 border border-gray-300 px-6 py-3 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
            >
              Вход
            </Link>
          </div>
        )}

        <p className="mt-10 text-xs text-gray-400 bg-amber-50 border border-amber-100 rounded-lg px-4 py-3">
          Публичният календар с наличните часове се добавя в следващата стъпка.
        </p>
      </div>
    </div>
  );
}
