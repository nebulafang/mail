import { ChevronRight, Clock, Globe, ShieldCheck, UserRoundX, Zap } from "lucide-react";
import { Row, Section } from "@/components/list";
import { IconTile } from "@/design-system/atoms";
import { faq, features } from "@/lib/seo-copy";
import { SiteFooter } from "./site-footer";

const ICONS = [
  <IconTile key="register" color="green"><UserRoundX /></IconTile>,
  <IconTile key="live" color="orange"><Zap /></IconTile>,
  <IconTile key="domain" color="blue"><Globe /></IconTile>,
  <IconTile key="expire" color="indigo"><Clock /></IconTile>,
  <IconTile key="privacy" color="gray"><ShieldCheck /></IconTile>,
];

export function SeoContent() {
  return (
    <>
      <Section header="为什么用临时邮箱">
        {features.map((f, i) => (
          <Row key={f.title} icon={ICONS[i]} title={f.title} subtitle={f.text} multiline />
        ))}
      </Section>

      <Section header="常见问题">
        {faq.map(({ q, a }) => (
          <details key={q} className="disclosure group border-b-(length:--hairline) border-separator last:border-b-0">
            <summary className="row-highlight flex min-h-(--row-min-h) cursor-pointer list-none items-center gap-3 px-(--row-pad-x) py-(--row-pad-y) outline-none focus-visible:bg-highlight [&::-webkit-details-marker]:hidden">
              <h3 className="flex-1 type-body text-label">{q}</h3>
              <ChevronRight className="disclosure-chevron size-(--chevron-size) shrink-0 text-tint" strokeWidth={2.6} />
            </summary>
            <p className="disclosure-body px-(--row-pad-x) pb-(--row-pad-y) type-subheadline text-label-2">{a}</p>
          </details>
        ))}
      </Section>


      <SiteFooter />
    </>
  );
}
