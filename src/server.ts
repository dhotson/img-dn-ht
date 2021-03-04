import express from "express";
import sharp from "sharp";
import request from "request";
import path from "path";
import fs from "fs";
import { access, mkdtemp, writeFile, rename } from "fs/promises";
import os from "os";

const cacheDir = path.join(path.dirname(__filename), "..", "image_cache");
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir);
}

const app = express();

const escapeUrl = (s: string) => Buffer.from(s).toString("base64");
const fileExists = (path: string) =>
  access(path, fs.constants.F_OK | fs.constants.R_OK)
    .then(() => true)
    .catch(() => false);

app.enable("strict routing");

app.get("/", (clientRequest, clientResponse) => {
  clientResponse.send("HEALTHY");
});

app.get("/img", (clientRequest, clientResponse) => {
  clientResponse.send(
    `
    <meta http-equiv="Accept-CH" content="DPR, Width">
    <img width="500px" sizes="500px" src="/img/s/-/https://dn.ht/journal/photos/roll1/000031-8.jpg" />
    `
  );
});

app.get(
  "/img/:sig/:w(\\d{0,})-:h(\\d{0,})/:url(*)",
  async (clientRequest, clientResponse, next) => {
    try {
      const widthHeader = clientRequest.get("Width");
      const dprHeader = clientRequest.get("DPR");

      const url = clientRequest.params.url;

      if (!url.startsWith("https://dn.ht/")) {
        return clientResponse.sendStatus(400);
      }

      clientResponse.set("Accept-CH", "Width, DPR");

      const width = widthHeader ? Number.parseInt(widthHeader, 10) : undefined;
      const accept = clientRequest.get("Accept");

      const dpr = dprHeader ? Number.parseFloat(dprHeader) : 1.0;
      const w = clientRequest.params.w
        ? dpr * Number.parseInt(clientRequest.params.w, 10)
        : undefined;
      const h = clientRequest.params.h
        ? dpr * Number.parseInt(clientRequest.params.h, 10)
        : undefined;
      const acceptsWebp = Boolean(
        accept && accept.indexOf("image/webp") !== -1
      );

      const finalWidth = width ? width : w;
      const finalHeight = width ? undefined : h;

      const cacheKey = `${escapeUrl(url)}-${finalWidth}-${finalHeight}-${
        acceptsWebp ? "webp" : "auto"
      }`;
      const metaFile = cacheKey + ".json";
      const cachePath = path.join(cacheDir, cacheKey);
      const cacheMetaPath = path.join(cacheDir, metaFile);

      const isCached = await fileExists(cachePath);
      if (isCached) {
        fs.readFile(cacheMetaPath, (err, buffer) => {
          const data = buffer.toString("utf8");
          const meta = JSON.parse(data);
          const originContentType = meta["content-type"];

          clientResponse.sendFile(cachePath, {
            headers: {
              "Img-Cache": "HIT",
              "Cache-Control": "public, s-maxage=8640000",
              Vary: "Accept, DPR, Width",
              "Content-Type": acceptsWebp ? "image/webp" : originContentType,
            },
          });
        });
      } else {
        // File is not in disk cache.. fetch and resize..
        request(url, {
          encoding: null,
          headers: { Accept: "image/*", timeout: 10000 },
        })
          .on("error", (error) => {
            console.error("origin error", error);
            clientResponse.sendStatus(500);
          })
          .on("response", async (originResponse) => {
            if (originResponse.statusCode !== 200) {
              console.log("origin status", originResponse.statusCode); // 200
              console.log(
                "origin content type",
                originResponse.headers["content-type"]
              );

              return clientResponse
                .status(400)
                .send("Unexpected status: " + originResponse.statusCode);
            }

            const convert = sharp()
              .rotate()
              .resize({
                width: finalWidth,
                height: finalHeight,
                fit: "inside",
                withoutEnlargement: true,
              })
              .on("warning", function (e) {
                console.error("Warning", e);
              })
              .on("error", function (e) {
                console.error("Error", e);
                clientResponse.sendStatus(500);
              })
              .on("info", function (info) {
                // console.log("info", info);
              });

            if (acceptsWebp) {
              clientResponse.set("Content-Type", "image/webp");
              convert.webp({
                smartSubsample: true,
              });
            } else {
              clientResponse.set(
                "Content-Type",
                originResponse.headers["content-type"]
              );
            }

            clientResponse.set("Cache-Control", "public, s-maxage=8640000");
            clientResponse.set("Vary", "Accept, DPR, Width");

            // Resized image
            const resized = originResponse.pipe(convert);
            resized.on("error", (err) => {
              if (err) console.error("Error resizing", err);
              clientResponse.sendStatus(500);
            });

            //Send to client
            const response = resized.pipe(clientResponse);
            response.on("error", (err) => {
              console.error("Error sending response", err);
              clientResponse.sendStatus(500);
            });

            // Cache resized image to disk
            const directory = await mkdtemp(
              path.join(os.tmpdir(), "img-dn-ht-")
            );
            const tempPath = path.join(directory, cacheKey);
            const tempMetaPath = path.join(directory, metaFile);

            await writeFile(
              tempPath + ".json",
              JSON.stringify({
                "content-type": originResponse.headers["content-type"],
              })
            );
            const tempFile = fs.createWriteStream(tempPath);

            await new Promise((resolve, reject) => {
              resized
                .pipe(tempFile) //
                .on("finish", resolve)
                .on("error", reject);
            });
            await rename(tempMetaPath, cacheMetaPath);
            await rename(tempPath, cachePath);
          });
      }
    } catch (err) {
      console.error(err);
      clientResponse.send(500);
      next(err);
    }
  }
);

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
});
