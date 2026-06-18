import Link from "next/link";
import { auth } from "@/auth";
import SignOutButton from "./sign-out-button";

export default async function Navbar() {
  const session = await auth();
  const user = session?.user;

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-bold text-gray-900 hover:text-green-700 transition-colors">
          <span className="text-xl">⚽</span>
          <span className="hidden sm:inline">Балона Враца</span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-4 text-sm">
          <Link
            href="/"
            className="text-gray-600 hover:text-gray-900 transition-colors"
          >
            Календар
          </Link>
          <Link
            href="/how-it-works"
            className="text-gray-600 hover:text-gray-900 transition-colors"
          >
            Как работи?
          </Link>
          {user ? (
            <>
              <Link
                href="/account"
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                Моите резервации
              </Link>
              {user.role === "ADMIN" && (
                <Link
                  href="/admin"
                  className="text-green-700 font-medium hover:text-green-900 transition-colors"
                >
                  Администрация
                </Link>
              )}
              <span className="text-gray-300 select-none">|</span>
              <span className="text-gray-500 hidden sm:inline truncate max-w-[140px]">
                {user.name ?? user.email}
              </span>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-gray-600 hover:text-gray-900 transition-colors"
              >
                Вход
              </Link>
              <Link
                href="/register"
                className="bg-green-600 text-white px-3 py-1.5 rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                Регистрация
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
