import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BookOpenCheck, GraduationCap, ShieldCheck } from 'lucide-react';
import { BuaLogo } from '../../components/brand/BuaLogo';
import buaCampus from '../../assets/bua-campus.jpg';

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'كل قرار قابل للتتبع',
    text: 'ELIGIBLE / NOT_ELIGIBLE / UNKNOWN / REVIEW_REQUIRED مع رقم القاعدة والمادة والصفحة.',
  },
  {
    icon: BookOpenCheck,
    title: 'إجابات من اللائحة فقط',
    text: 'المساعد يستشهد بالنص الرسمي، ويحوّل الأسئلة الغامضة إلى مرشد بشري.',
  },
  {
    icon: GraduationCap,
    title: 'خطط استشارية (DRAFT)',
    text: 'تخطيط ذكي للفصل القادم مع مراعاة المتطلبات والعبء الأكاديمي والحد الأقصى.',
  },
];

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-screen bg-ink-50 lg:grid-cols-[1.08fr_1fr]">
      <section className="relative hidden overflow-hidden text-white lg:flex lg:flex-col lg:justify-between">
        <img
          src={buaCampus}
          alt="حرم جامعة بدر بأسيوط"
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div
          className="absolute inset-0 bg-gradient-to-b from-ink-950/85 via-brand-950/60 to-ink-950/90"
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(229,174,50,0.18),transparent_52%)]"
          aria-hidden
        />
        <div
          className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-ink-950 to-transparent"
          aria-hidden
        />

        <div className="relative p-10 xl:p-12">
          <div className="inline-flex items-center rounded-2xl bg-white/95 px-4 py-3 shadow-float ring-1 ring-white/60 backdrop-blur-sm">
            <BuaLogo globeClassName="h-12 w-12" wordmarkClassName="h-[44px] w-auto" />
          </div>
          <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-100/80">
            كلية تكنولوجيا المعلومات وعلوم البيانات
          </p>

          <h1 className="mt-12 max-w-xl font-display text-4xl font-black leading-[1.28] text-balance drop-shadow-sm xl:text-[2.75rem]">
            قرارات أكاديمية واضحة،
            <span className="text-gold-300"> لكل طالب وفي كل فصل.</span>
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-7 text-brand-50/85">
            المرشد الأكاديمي الذكي يقرأ لائحة الكلية، يتحقق من المتطلبات، ويشرح كل قرار بالمادة والصفحة —
            دون أن يسجّل أي مقرر نيابة عن الطالب.
          </p>

          <div className="mt-9 grid max-w-lg gap-3">
            {FEATURES.map(({ icon: Icon, title: featureTitle, text }) => (
              <div
                key={featureTitle}
                className="flex gap-3 rounded-2xl border border-white/15 bg-ink-950/35 p-4 shadow-sm backdrop-blur-md"
              >
                <div className="mt-0.5 shrink-0">
                  <Icon className="h-5 w-5 text-gold-300" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">{featureTitle}</p>
                  <p className="mt-0.5 text-xs leading-5 text-brand-50/75">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative px-10 pb-8 text-[11px] leading-5 text-brand-50/55 xl:px-12">
          AIDM · Badr University in Assiut · منصة استشارية لا تُنشئ تسجيلًا رسميًا.
        </p>
      </section>

      <section className="relative flex items-center justify-center overflow-hidden px-4 py-10 sm:px-8">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_75%_0%,rgba(22,71,65,0.10),transparent_58%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-24 -start-24 h-72 w-72 rounded-full bg-gold-200/20 blur-3xl"
          aria-hidden
        />

        <div className="relative w-full max-w-md">
          <div className="mb-7 flex flex-col items-start gap-2 lg:hidden">
            <BuaLogo globeClassName="h-11 w-11" wordmarkClassName="h-[40px] w-auto" />
            <p className="text-[11px] font-semibold text-ink-500">المرشد الأكاديمي الذكي · جامعة بدر بأسيوط</p>
          </div>

          <div className="relative overflow-hidden rounded-3xl border border-ink-100 bg-white p-6 shadow-float sm:p-8">
            <div
              className="absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-brand-800 via-brand-500 to-gold-400"
              aria-hidden
            />
            <div className="mb-6">
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-[11px] font-bold text-brand-800 ring-1 ring-inset ring-brand-100">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-500" aria-hidden />
                منصة الإرشاد الأكاديمي
              </div>
              <h2 className="font-display text-2xl font-extrabold text-ink-950">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-ink-500">{subtitle}</p>
            </div>
            {children}
          </div>

          {footer && <div className="mt-5 text-center text-sm text-ink-500">{footer}</div>}
          <p className="mt-6 text-center text-[11px] leading-5 text-ink-400">
            <Link to="/login" className="hover:text-ink-600">
              الوصول محمي · الجلسات تُدوّر تلقائيًا · كل العمليات الحساسة تُسجّل في سجل التدقيق
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
