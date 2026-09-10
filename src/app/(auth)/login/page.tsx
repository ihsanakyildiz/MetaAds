import { Suspense } from "react";
import { ShieldCheck, Sparkles, WalletCards } from "lucide-react";
import { LoginForm } from "@/app/(auth)/login/login-form";

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-[linear-gradient(160deg,#071018_0%,#10233d_52%,#1877f2_130%)] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 opacity-30 [background:radial-gradient(circle_at_20%_20%,#1877f2,transparent_28%),radial-gradient(circle_at_80%_80%,#38bdf8,transparent_24%)]" />
        <div className="relative">
          <p className="text-sm font-medium tracking-[0.2em] text-white/70">
            METAADS
          </p>
          <h1 className="mt-6 max-w-lg text-4xl font-semibold leading-tight">
            Reklam kalitesini ölçün, satış getiren kampanyaları öne çıkarın.
          </h1>
          <p className="mt-4 max-w-md text-sm leading-6 text-white/70">
            Meta Business Suite hesaplarınızı bağlayın. Tıklama, dönüşüm ve
            kreatif kalitesini tek panelde izleyin.
          </p>
        </div>
        <div className="relative grid gap-4">
          <Feature
            icon={WalletCards}
            title="Hesap içe aktarma"
            text="Business Manager altındaki reklam hesaplarını veritabanına alın."
          />
          <Feature
            icon={Sparkles}
            title="Kalite skoru"
            text="En iyi tıklanan ve en çok satış getiren reklamları ayırın."
          />
          <Feature
            icon={ShieldCheck}
            title="Rol bazlı erişim"
            text="Yönetici, analist ve reklam veren için ayrı yetkiler."
          />
        </div>
      </section>
      <section className="flex items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8">
            <p className="text-sm font-medium text-accent">Yönetim paneli</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              Hesabınıza giriş yapın
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              Sadece yetkili ekip üyeleri bu panele erişebilir.
            </p>
          </div>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof WalletCards;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-3 rounded-2xl bg-white/8 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-sm text-white/65">{text}</p>
      </div>
    </div>
  );
}
