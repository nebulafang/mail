"use client";

import { Accessibility, Eraser, Eye, Gauge, UserRound, Info, Moon, RotateCcw, ShieldCheck, Sun, SunMoon, Trash2, Type } from "lucide-react";
import { useRef, useState } from "react";
import { useIsClient } from "usehooks-ts";
import { Picker, Segmented } from "@/components/form";
import { Slider } from "@/components/slider";
import { GlassPreview } from "@/components/glass-preview";
import { List, Row, Section } from "@/components/list";
import { useScene } from "@/components/scene/context";
import { ScenePicker } from "@/components/scene/picker";
import { Screen } from "@/components/screen";
import { AppIcon, Avatar, IconTile, Inset } from "@/design-system/atoms";
import { setThemePreference, useThemePreference, type ThemePreference } from "@/environment/theme";
import { toAvatarDataUrl } from "@/lib/avatar-image";
import { MAX_SAVED_MAILBOXES } from "@/lib/config";
import { clearSiteData } from "@/lib/site-data";
import { useNavigation } from "@/navigation/context";
import { present, toast } from "@/presentation/api";
import { useAdminSession } from "@/services/admin";
import { useAccount } from "@/services/auth";
import { useSavedMailboxes } from "@/services/mail";
import { useMailboxAvatar, useUserAvatar } from "@/store/avatar";
import { defaultDisplaySettings, useSettings, type Tristate } from "@/store/settings";
import { presentAccountSheet } from "./account";
import { presentAdminLogin } from "./admin";

const tristate: { value: Tristate; label: string }[] = [
  { value: "system", label: "跟随系统" },
  { value: "on", label: "开启" },
  { value: "off", label: "关闭" },
];

export function SettingsScreen() {
  const nav = useNavigation();
  const { data: account } = useAccount();
  const { data: admin } = useAdminSession();
  const userAvatar = useUserAvatar(account?.user?.username);
  const theme = useThemePreference();
  const isClient = useIsClient();
  const saved = useSavedMailboxes();
  const settings = useSettings();
  const scene = useScene();
  const customized =
    settings.glassClarity !== 0.5 ||
    settings.textScale !== 1 ||
    settings.scene !== defaultDisplaySettings.scene ||
    [settings.reduceMotion, settings.reduceTransparency, settings.increaseContrast, settings.performanceMode].some((v) => v !== "system");

  async function forgetAll() {
    const choice = await present.actionSheet({
      title: "只清除这台设备上的列表，邮箱本身会保留到过期，知道地址仍可重新打开",
      actions: [{ id: "clear", label: "清除本地邮箱列表", role: "destructive" }],
    });
    if (choice !== "clear") return;
    saved.retain([]);
    toast.success("已清除本地邮箱列表");
  }

  const [wiping, setWiping] = useState(false);

  async function wipeAll() {
    const choice = await present.actionSheet({
      title: "删除这个浏览器里本站的全部数据：邮箱列表、头像、显示设置和缓存。邮箱本身会保留到过期",
      actions: [{ id: "wipe", label: "清除全部浏览器数据", role: "destructive" }],
    });
    if (choice !== "wipe") return;
    setWiping(true);
    await clearSiteData();
  }

  const avatar = useMailboxAvatar();
  const avatarInput = useRef<HTMLInputElement>(null);

  async function changeAvatar() {
    const choice = await present.actionSheet({
      title: "所有邮箱共用这张头像，只保存在这台设备上",
      actions: [
        { id: "pick", label: "从相册选择" },
        ...(avatar.isCustom ? [{ id: "reset", label: "恢复默认头像", role: "destructive" as const }] : []),
      ],
    });
    if (choice === "pick") avatarInput.current?.click();
    if (choice === "reset") {
      avatar.reset();
      toast.success("已恢复默认头像");
    }
  }

  async function onAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      avatar.set(await toAvatarDataUrl(file));
      toast.success("头像已更新");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "头像保存失败");
    }
  }

  return (
    <Screen title="设置">
      <List>
        <Section
          appear
          footer={
            account?.enabled
              ? account.user
                ? "登录后新建或加入账号的邮箱只有你能查看，并在你的所有设备间同步"
                : "可选。登录后邮箱列表会在多台设备间同步，并且只有你能查看"
              : undefined
          }
        >
          {account?.enabled && account.user ? (
            <Row
              icon={<Avatar seed={`user:${account.user.username}`} text={account.user.username} src={userAvatar.src} size={56} />}
              title={<span className="type-title3">{account.user.username}</span>}
              subtitle="个人中心与密码"
              multiline
              chevron
              to={{ name: "profile" }}
              className="py-2"
            />
          ) : account?.enabled ? (
            <Row
              icon={
                <span className="glyph-well size-14 [--well-bg:var(--fill-2)] [&_svg]:size-7">
                  <UserRound strokeWidth={2} />
                </span>
              }
              title={<span className="type-title3">{account.registration === false ? "登录" : "登录 / 注册"}</span>}
              subtitle="用户名 + 密码，不需要手机号"
              chevron
              onPress={() => presentAccountSheet()}
              className="py-2"
            />
          ) : (
            <Row
              icon={<AppIcon size={56} />}
              title={<span className="type-title3">临时邮箱</span>}
              subtitle="收验证码，不暴露真实邮箱"
              className="py-2"
            />
          )}
        </Section>

        <Section header="外观">
          <Row
            icon={<IconTile color="indigo"><SunMoon /></IconTile>}
            title="深色模式"
            detail={
              isClient && (
                <Segmented<ThemePreference>
                  className="w-(--segment-inline-w)"
                  label="深色模式"
                  value={theme}
                  onChange={setThemePreference}
                  options={[
                    { value: "system", label: "自动" },
                    { value: "light", label: "浅色" },
                    { value: "dark", label: "深色" },
                  ]}
                />
              )
            }
          />
          <Row
            icon={<Avatar seed="mailbox-avatar" text="头" src={avatar.src} size={32} />}
            title="邮箱头像"
            detail={avatar.isCustom ? "自定义" : "默认"}
            chevron
            onPress={changeAvatar}
          />
        </Section>
        <input ref={avatarInput} type="file" accept="image/*" hidden onChange={onAvatarFile} />

        <Section header="背景" footer="只保存在这台设备上。开启“减弱动态效果”时，花瓣和星星会停下来。">
          <Inset className="py-4">
            <ScenePicker value={scene} onChange={(next) => settings.set({ scene: next })} />
          </Inset>
        </Section>

        <Section header="玻璃效果" footer="向左更着色、更易读；向右更清透。整个 App 的标签栏、导航按钮、弹层都会跟着变化。">
          <Inset className="pt-4">
            <GlassPreview />
          </Inset>
          <Inset className="py-1">
            <Slider
              label="玻璃透明度"
              value={settings.glassClarity}
              onChange={(v) => settings.set({ glassClarity: v })}
              minIcon={<Moon />}
              maxIcon={<Sun />}
            />
          </Inset>
        </Section>

        <Section header="辅助功能" footer="“跟随系统”时读取系统的辅助功能设置">
          <Row
            icon={<IconTile color="blue"><Accessibility /></IconTile>}
            title="减弱动态效果"
            detail={<Picker label="减弱动态效果" value={settings.reduceMotion} options={tristate} onChange={(v) => settings.set({ reduceMotion: v })} />}
          />
          <Row
            icon={<IconTile color="gray"><Eye /></IconTile>}
            title="降低透明度"
            detail={<Picker label="降低透明度" value={settings.reduceTransparency} options={tristate} onChange={(v) => settings.set({ reduceTransparency: v })} />}
          />
          <Row
            icon={<IconTile color="indigo"><Moon /></IconTile>}
            title="增强对比度"
            detail={<Picker label="增强对比度" value={settings.increaseContrast} options={tristate} onChange={(v) => settings.set({ increaseContrast: v })} />}
          />
          <Row
            icon={<IconTile color="green"><Gauge /></IconTile>}
            title="性能模式"
            detail={<Picker label="性能模式" value={settings.performanceMode} options={tristate} onChange={(v) => settings.set({ performanceMode: v })} />}
          />
          <Inset className="py-1">
            <Slider
              label="文字大小"
              value={settings.textScale}
              min={0.85}
              max={1.3}
              step={0.05}
              onChange={(v) => settings.set({ textScale: v })}
              minIcon={<Type className="size-4!" />}
              maxIcon={<Type />}
            />
          </Inset>
          <Row
            icon={<IconTile color="gray"><RotateCcw /></IconTile>}
            title="恢复默认显示设置"
            tint
            disabled={!customized}
            onPress={() => {
              settings.reset();
              toast.success("已恢复默认显示设置");
            }}
          />
        </Section>

        {admin?.enabled && (
          <Section header="管理" footer="管理用户，查看用户的邮件和 Catch-all 邮件">
            <Row
              icon={<IconTile color="indigo"><ShieldCheck /></IconTile>}
              title="管理后台"
              detail={admin.admin ? "已登录" : undefined}
              chevron
              onPress={() => (admin.admin ? nav.selectTab("admin") : presentAdminLogin(() => nav.selectTab("admin")))}
            />
          </Section>
        )}

        <Section header="数据" footer={`未登录时“我的邮箱”只保存在这台设备上，最多 ${MAX_SAVED_MAILBOXES} 个`}>
          <Row
            icon={<IconTile color="red"><Trash2 /></IconTile>}
            title="清除本地邮箱列表"
            detail={saved.addresses.length ? `${saved.addresses.length} 个` : undefined}
            destructive
            disabled={!saved.addresses.length}
            onPress={forgetAll}
          />
          <Row
            icon={<IconTile color="red"><Eraser /></IconTile>}
            title="清除全部浏览器数据"
            detail={wiping ? "正在清除…" : undefined}
            destructive
            disabled={wiping}
            onPress={wipeAll}
          />
        </Section>

        <Section header="关于">
          <Row icon={<IconTile color="blue"><Info /></IconTile>} title="关于本站" to={{ name: "about" }} />
        </Section>
      </List>
    </Screen>
  );
}
