import base64
import struct
import sys
import urllib.parse
import urllib.request
import zlib
from email.message import EmailMessage
from email.utils import formatdate, make_msgid

BASE = sys.argv[2] if len(sys.argv) > 2 else "http://localhost:8787"
TO = sys.argv[1]
COUNT = int(sys.argv[3]) if len(sys.argv) > 3 else 40

SENDERS = [
    ("GitHub", "noreply@github.test"),
    ("Steam", "noreply@steam.test"),
    ("Notion", "team@notion.test"),
    ("淘宝", "service@taobao.test"),
    ("Discord", "noreply@discord.test"),
]


def png(width, height, rgb):
    row = b"\x00" + bytes(rgb) * width
    raw = row * height

    def chunk(kind, data):
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


def build(i):
    name, address = SENDERS[i % len(SENDERS)]
    msg = EmailMessage()
    msg["From"] = f"{name} <{address}>"
    msg["To"] = TO
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain="seed.test")
    if i % 3 == 0:
        code = f"{(i * 7919 + 100000) % 900000 + 100000}"
        msg["Subject"] = f"测试邮件 {i + 1}：你的验证码是 {code}"
        msg.set_content(f"你的验证码是 {code}，10 分钟内有效。\n\n这是第 {i + 1} 封本地测试邮件。")
    else:
        msg["Subject"] = f"测试邮件 {i + 1}：每周动态汇总"
        msg.set_content(f"这是第 {i + 1} 封本地测试邮件。\n\n" + "这一段用来撑出两行预览文字，方便检查列表行的截断效果。" * 3)
        msg.add_alternative(
            f"<h2>测试邮件 {i + 1}</h2><p>这是一封 <b>HTML</b> 测试邮件。</p>"
            + "<p>正文段落，用来检查邮件详情页的滚动和左右滑动切换。</p>" * 12,
            subtype="html",
        )
    if i % 4 == 1:
        color = [(60, 140, 240), (240, 120, 60), (80, 190, 120)][i % 3]
        msg.add_attachment(png(640, 420, color), maintype="image", subtype="png", filename=f"photo-{i + 1}.png")
    if i % 8 == 5:
        msg.add_attachment(base64.b64encode(b"seed") * 64, maintype="application", subtype="octet-stream", filename=f"file-{i + 1}.bin")
    return msg


for i in range(COUNT):
    msg = build(i)
    query = urllib.parse.urlencode({"from": SENDERS[i % len(SENDERS)][1], "to": TO})
    request = urllib.request.Request(f"{BASE}/cdn-cgi/handler/email?{query}", data=msg.as_bytes(), method="POST")
    with urllib.request.urlopen(request) as response:
        print(i + 1, response.status, response.read()[:80].decode("utf-8", "replace").strip())
