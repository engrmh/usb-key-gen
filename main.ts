import { app, BrowserWindow, ipcMain, dialog } from "electron";
import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as child_process from "child_process";

let mainWindow: BrowserWindow;

const PASSWORD = "SmHsB1379Engr.m@#github.com/engrmh";

const getUSBSerialWindows = (): string => {
  try {
    const output = child_process
      .execSync("wmic diskdrive get SerialNumber,MediaType")
      .toString();
    const lines = output.split("\n").filter((l) => l.includes("Removable"));
    const serial = lines[0].trim().split(/\s+/)[0];
    return serial;
  } catch {
    return "UNKNOWN";
  }
};

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    autoHideMenuBar: true,
    title: "Key Generator",
  });

  const fontPath = path.join(
    __dirname,
    "assets",
    "fonts",
    "Vazirmatn-FD-NL-Regular.woff2"
  );
  const fontData = fs.readFileSync(fontPath).toString("base64");

  mainWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(`
    <html dir="rtl">
      <head>
        <meta charset="UTF-8">
        <style>
          @font-face {
            font-family: 'Vazirmatn';
            src: url(data:font/woff2;base64,${fontData}) format('woff2');
            font-weight: normal;
            font-style: normal;
          }
         *{
          font-family: Vazirmatn, sans-serif;
          }
          body {
            font-family: Vazirmatn, sans-serif;
            background: #1e1e1e;
            color: #f0f0f0;
            padding: 20px;
          }
          label {
            display: block;
            margin: 10px 0 4px;
          }
          input {
            width: 100%;
            padding: 8px;
            background: #2a2a2a;
            color: #fff;
            border: 1px solid #555;
            border-radius: 6px;
          }
          button {
            margin-top: 15px;
            padding: 10px 15px;
            background-color: #3b82f6;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
          }
          button:hover {
            background-color: #2563eb;
          }
          #status, #info {
            margin-top: 10px;
            background: #2a2a2a;
            padding: 10px;
            border-radius: 6px;
            white-space: pre-wrap;
          }
          hr {
            margin: 30px 0;
            border-color: #444;
          }
        </style>
      </head>
      <body>
        <h2>🔐 ساخت کلید سخت‌افزاری</h2>
        <label>🏢 نام فروشگاه:</label>
        <input id="store">
        <label>🔑 کلید دسترسی:</label>
        <input id="access">
        <label>📅 تاریخ انقضا (YYYY-MM-DD):</label>
        <input id="expire">
        <button onclick="makeKey()">ساخت کلید روی فلش</button>
        <div id="status"></div>

        <hr>

        <h3>📂 خواندن فایل mhsb7</h3>
        <button onclick="selectFile()">انتخاب فایل</button>
        <div id="info"></div>

        <script>
          const { ipcRenderer } = require('electron');

          function makeKey() {
            const store = document.getElementById('store').value;
            const access = document.getElementById('access').value;
            const expire = document.getElementById('expire').value;
            ipcRenderer.invoke('generate-usb-key', { store, access, expire })
              .then(res => document.getElementById('status').innerText = res.message)
              .catch(() => document.getElementById('status').innerText = '⚠️ خطا در تولید کلید');
          }

          function selectFile() {
            ipcRenderer.invoke('read-mhsb7').then(data => {
              document.getElementById('info').innerText =
                data.success ? JSON.stringify(data.data, null, 2) : '❌ خطا: ' + data.message;
            });
          }
        </script>
      </body>
    </html>
  `)}`
  );
};

ipcMain.handle("generate-usb-key", async (_, data) => {
  try {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(16);
    const secret = crypto.pbkdf2Sync(PASSWORD, salt, 100000, 32, "sha512");

    const keyData = {
      storeName: data.store,
      accessKey: data.access,
      expireDate: data.expire,
      hardwareId: getUSBSerialWindows(),
    };

    const drives = ["E:/", "F:/", "G:/", "H:/"];
    let usbPath = null;
    for (const drive of drives) {
      if (fs.existsSync(drive)) {
        usbPath = drive;
        break;
      }
    }

    if (!usbPath) {
      dialog.showMessageBoxSync({
        message: "فلش یافت نشد!",
        type: "error",
        buttons: ["بستن"],
      });
    }
    if (!usbPath) return { success: false, message: "⚠️ فلش یافت نشد!" };

    const folderPath = path.join(usbPath, ".mhsb");
    if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath);
    const filePath = path.join(folderPath, "access.mhsb7");

    const cipher = crypto.createCipheriv("aes-256-ctr", secret, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(keyData)),
      cipher.final(),
    ]);

    const finalBuffer = Buffer.concat([salt, iv, encrypted]);
    fs.writeFileSync(filePath, finalBuffer);
    dialog.showMessageBoxSync({
      message: "کلید با موفقیت ساخته شد!",
      type: "info",
      buttons: ["بستن"],
    });
    return { success: true, message: "✅ کلید با موفقیت ساخته شد!" };
  } catch (err) {
    return { success: false, message: "❌ خطا در ساخت کلید" };
  }
});

ipcMain.handle("read-mhsb7", async () => {
  try {
    const result = await dialog.showOpenDialog({
      filters: [{ name: "MHSB Key File", extensions: ["mhsb7"] }],
      properties: ["openFile"],
    });

    if (result.canceled || result.filePaths.length === 0)
      return { success: false, message: "فایلی انتخاب نشد." };

    const fileBuffer = fs.readFileSync(result.filePaths[0]);
    const salt = fileBuffer.slice(0, 16);
    const iv = fileBuffer.slice(16, 32);
    const encrypted = fileBuffer.slice(32);

    const secret = crypto.pbkdf2Sync(PASSWORD, salt, 100000, 32, "sha512");
    const decipher = crypto.createDecipheriv("aes-256-ctr", secret, iv);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    const parsed = JSON.parse(decrypted.toString());
    return { success: true, data: parsed };
  } catch (err) {
    return {
      success: false,
      message: "خواندن یا رمزگشایی فایل با خطا مواجه شد.",
    };
  }
});

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
