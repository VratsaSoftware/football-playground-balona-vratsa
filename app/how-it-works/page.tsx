import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Как работи? — Балона Враца",
  description: "Как работи системата за онлайн резервации на футболните игрища на Балона Враца.",
};

export default function AboutPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Как работи?</h1>

      <div className="space-y-5 text-gray-700 leading-relaxed">
        <p>
          Тази платформа позволява лесно онлайн резервиране на футболните
          игрища на <strong>Балона Враца</strong>. Всичко е на едно място —
          вижте кога е свободно и запишете вашия час без обаждане.
        </p>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Преглед на резервациите
          </h2>
          <p>
            Всеки посетител може да отвори{" "}
            <Link href="/" className="text-green-700 font-medium hover:underline">
              календара
            </Link>{" "}
            и да види кои часове са свободни или заети на двете игрища — без
            да е нужна регистрация или вход.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Как се прави резервация?
          </h2>
          <p>
            За да направите резервация, трябва да имате акаунт. Регистрацията
            е безплатна — необходими са имейл адрес, телефонен номер и
            парола. По желание можете да добавите и название на отбора.
          </p>
          <p className="mt-2">
            След като влезете в системата, изберете свободен час от
            календара, попълнете детайлите и потвърдете. Ще получите
            потвърждение на имейла си.
          </p>
          <p className="mt-2">
            Имайте предвид, че нов акаунт трябва да бъде одобрен от
            администратор, преди да може да прави резервации.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Повтарящи се резервации
          </h2>
          <p>
            Ако играете редовно — например всяка сряда в 19:00 — можете да
            заявите повтаряща се резервация. Посочвате ден от седмицата, час и
            игрище, и системата автоматично запазва часа за вас за всяка
            следваща седмица в рамките на разрешения хоризонт за резервации.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Управление на резервациите ви
          </h2>
          <p>
            Всички ваши резервации са достъпни в страницата{" "}
            <Link href="/account" className="text-green-700 font-medium hover:underline">
              Моите резервации
            </Link>
            , откъдето можете да ги следите или анулирате.
          </p>
        </section>
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/register"
          className="bg-green-600 text-white px-5 py-2.5 rounded-lg hover:bg-green-700 transition-colors font-medium text-sm"
        >
          Регистрирайте се безплатно
        </Link>
        <Link
          href="/"
          className="border border-gray-300 text-gray-700 px-5 py-2.5 rounded-lg hover:bg-gray-100 transition-colors font-medium text-sm"
        >
          Към календара
        </Link>
      </div>
    </div>
  );
}
