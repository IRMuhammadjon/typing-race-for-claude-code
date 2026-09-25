# zerikma'ni npm'ga chiqarish

Maqsad: istalgan odam `npx zerikma` bilan terminal versiyani ishga tushira olishi. Hammasi bepul, taxminan 10 daqiqa oladi.

> Parol, 2FA kodlari va tokenlarni hech kimga (jumladan chatga) yubormang.

## 1. Akkaunt ochish

1. [npmjs.com/signup](https://www.npmjs.com/signup) sahifasini oching.
2. Maydonlarni to'ldiring:
   - **Username:** kichik harflarda, masalan `muhammadjon-r` (profil manzilida ko'rinadi)
   - **Email:** o'zingizning pochtangiz
   - **Password:** kuchli parol, kamida 10 belgi
3. **Create an Account** ni bosing.
4. Pochtaga kelgan tasdiqlash kodini saytga kiriting.

## 2. Ikki bosqichli himoya (2FA)

npm paket chiqarishda ko'pincha 2FA so'raydi, shuning uchun uni oldindan yoqing.

1. O'ng yuqoridagi profil rasmi → **Account**.
2. **Two-Factor Authentication** → **Enable 2FA**.
3. Telefondagi **Google Authenticator** (yoki shunga o'xshash ilova) bilan QR kodni skanerlang va ilovadagi 6 xonali kodni kiriting.
4. Zaxira kodlarni (recovery codes) xavfsiz joyga saqlang.

## 3. Terminaldan chiqarish

VS Code terminalini oching (`` Ctrl+` ``) va buyruqlarni navbat bilan kiriting.

**Login:**

```
npm login
```

"Press ENTER to open in the browser" chiqqanda **Enter** ni bosing va brauzerda kiring. Terminalda `Logged in on https://registry.npmjs.org/` chiqsa, login bo'ldi.

**Tekshirish:**

```
npm whoami
```

Username'ingiz chiqishi kerak.

**Chiqarish:**

```
cd D:\claude-games\cli
npm publish
```

2FA kodi so'ralsa, telefondagi 6 xonali kodni kiriting. Oxirida `+ zerikma@0.2.0` chiqsa, paket chiqdi.

`npm publish` o'zi `shared/` fayllarini paketga ko'chiradi va keyin nusxalarni tozalaydi (`prepack` / `postpack` skriptlari), qo'lda hech narsa qilish shart emas.

## 4. Tekshirish

- [npmjs.com/package/zerikma](https://www.npmjs.com/package/zerikma) sahifasi ochilishi kerak.
- Istalgan terminalda:

  ```
  npx zerikma
  ```

  Birinchi marta "Ok to proceed?" deb so'raydi, `y` bosing va o'yin ochiladi.

## Keyingi versiyalar

1. `cli/package.json` dagi `"version"` ni oshiring (masalan `0.2.0` → `0.3.0`). npm bir versiyani ikki marta chiqarishga ruxsat bermaydi.
2. `cd D:\claude-games\cli` → `npm publish`.

## Tez-tez uchraydigan xatolar

| Xato | Nima qilish kerak |
| --- | --- |
| `ENEEDAUTH` / `need auth` | `npm login` qilinmagan: 3-bo'limdagi login'ni qaytaring |
| `EOTP` / `one-time password` | 2FA kodi kerak: `npm publish --otp=123456` (telefondagi kod bilan) |
| `403 You cannot publish over the previously published versions` | `cli/package.json` da versiyani oshiring |
| `403 ... name too similar` yoki `name taken` | `zerikma` nomini boshqa odam olgan: xabar bering, nomni o'zgartiramiz |
