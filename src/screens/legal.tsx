"use client";

import { CodeXml, FileText, Info, Lock, Mail } from "lucide-react";
import { List, Row, Section } from "@/components/list";
import { Screen } from "@/components/screen";
import { IconTile } from "@/design-system/atoms";
import { EXPIRY_OPTIONS } from "@/lib/config";
import { site } from "@/lib/seo-copy";
import { useConfig } from "@/services/mail";

const expiries = Object.values(EXPIRY_OPTIONS)
  .map((o) => o.label)
  .join("、");

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 bg-surface px-(--row-pad-x) py-(--row-pad-y) type-body text-label [&_li]:ml-5 [&_li]:list-disc [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-2">
      {children}
    </div>
  );
}

function useContact() {
  return useConfig().data?.contact;
}

function ContactSection() {
  const contact = useContact();
  if (!contact) return null;
  return (
    <Section header="联系我们" footer="举报滥用、申请删除数据或反馈问题，都可以发邮件给我们。">
      <Row icon={<IconTile color="blue"><Mail /></IconTile>} title={contact} href={`mailto:${contact}`} />
    </Section>
  );
}

export function AboutScreen() {
  return (
    <Screen title="关于本站">
      <List>
        <Section>
          <Prose>
            <p>
              {site.name}是一个免费的一次性邮箱服务。打开网页就能生成一个邮箱地址，不需要手机号，也不需要注册。邮件到达后会实时显示在页面上，验证码会被自动识别，可以一键复制。
            </p>
            <p>
              它适合注册网站、领取优惠、测试服务这类只需要收一次邮件的场景，这样你的真实邮箱不会被泄露，也不会收到后续的垃圾邮件。本站只能收信，不能发信。
            </p>
            <p>地址有效期可选 {expiries}，到期后地址、邮件和附件会被自动删除。登录账号后，可以把地址设为永久。</p>
          </Prose>
        </Section>
        <Section header="更多信息">
          <Row icon={<IconTile color="blue"><Lock /></IconTile>} title="隐私政策" to={{ name: "privacy" }} />
          <Row icon={<IconTile color="gray"><FileText /></IconTile>} title="服务条款" to={{ name: "terms" }} />
          <Row icon={<IconTile color="gray"><CodeXml /></IconTile>} title="本站源代码" detail="AGPL-3.0" href={site.sourceCode} />
          <Row icon={<IconTile color="gray"><CodeXml /></IconTile>} title="基于开源项目" href={site.sourceRepo} />
          <Row icon={<IconTile color="gray"><Info /></IconTile>} title="运行在" detail="Cloudflare Workers" />
        </Section>
        <ContactSection />
      </List>
    </Screen>
  );
}

export function PrivacyScreen() {
  return (
    <Screen title="隐私政策">
      <List>
        <Section header="谁能看到你的邮件">
          <Prose>
            <ul>
              <li>不登录时创建的是公共地址：任何知道这个地址的人都能读信、删信。</li>
              <li>登录后新建或加入账号的邮箱只有你能查看。</li>
              <li>站点运营者可以通过管理后台或直接访问数据库看到所有收到的邮件，包括发到还没人创建的地址的邮件，只会在处理滥用和排查故障时查看。</li>
            </ul>
            <p>所以请不要用临时邮箱接收银行、工作或找回密码这类重要邮件。</p>
          </Prose>
        </Section>
        <Section header="数据保存多久">
          <Prose>
            <ul>
              <li>邮箱到期后，系统会在 1 小时内自动删除邮箱，以及其中的邮件。永久邮箱不会过期。</li>
              <li>你删除邮件、清空收件箱或删除邮箱时，数据会立即从服务器上永久删除，无法恢复。</li>
              <li>每个邮箱只保留最近 1000 封邮件，更早的会被自动删除。</li>
              <li>附件只记录文件名和大小，不保存内容。</li>
              <li>如果你希望删除与自己有关的数据，请联系我们。</li>
            </ul>
          </Prose>
        </Section>
        <Section header="第三方">
          <Prose>
            <p>
              本站运行在 Cloudflare Workers 上，所有请求都会经过 Cloudflare 的网络。本站不投放广告，不使用第三方统计工具，也不会出售或主动向第三方提供你的数据，法律要求的情况除外。
            </p>
            <p>HTML 邮件会先净化，再放进禁止执行脚本的沙盒里显示。</p>
          </Prose>
        </Section>
        <ContactSection />
      </List>
    </Screen>
  );
}

export function TermsScreen() {
  return (
    <Screen title="服务条款">
      <List>
        <Section header="服务说明">
          <Prose>
            <p>
              {site.name}免费提供一次性收信服务，按现状提供。我们会尽力保持服务稳定，但不保证服务一直可用、邮件一定能收到，也可能在不提前通知的情况下调整或停止部分功能。
            </p>
          </Prose>
        </Section>
        <Section header="禁止的用途">
          <Prose>
            <ul>
              <li>从事违法活动、诈骗、骚扰他人，或接收、传播违法内容。</li>
              <li>大规模批量创建地址，或借此绕过其他网站的注册限制、滥用其他服务。</li>
              <li>攻击、干扰本站，或绕过本站的频率限制。</li>
            </ul>
            <p>发现滥用时，我们可能会删除相关地址、停用账号或限制访问。</p>
          </Prose>
        </Section>
        <Section header="你需要知道的">
          <Prose>
            <ul>
              <li>公共地址不是私密的，知道地址的人都能看到里面的邮件。</li>
              <li>邮箱到期后，邮件和附件会被永久删除，无法恢复。</li>
              <li>请不要用临时邮箱注册需要长期使用或涉及资金的重要账号。</li>
            </ul>
          </Prose>
        </Section>
        <Section header="免责声明">
          <Prose>
            <p>
              因使用或无法使用本服务造成的任何损失，包括漏收邮件、数据被删除或被他人查看，本站不承担责任。继续使用本服务，即表示你同意这些条款。条款更新后会在本页公布。
            </p>
          </Prose>
        </Section>
        <ContactSection />
      </List>
    </Screen>
  );
}
