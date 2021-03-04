import express from "express";
import sharp from "sharp";
import request from "request";
import path from "path";
import fs from "fs";
import { access } from "fs/promises";
import os from "os";
import stream, { finished } from "stream";

const cacheDir = path.join(path.dirname(__filename), "image_cache");
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir);
}

const app = express();

const escapeUrl = (s: string) => Buffer.from(s).toString("base64");
const fileExists = async (path: string) => {
  try {
    await access(path, fs.constants.F_OK | fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

app.enable("strict routing");

app.get("/", (clientRequest, clientResponse) => {
  clientResponse.send("HEALTHY");
});

app.get("/img", (clientRequest, clientResponse) => {
  clientResponse.send(
    `
    <meta http-equiv="Accept-CH" content="Width">
    <img width="400px" sizes="400px" src="/img/s/-/https://dn.ht/journal/photos/roll1/000031-8.jpg" />
    `
  );
});

app.get(
  "/img/:sig/:w(\\d{0,})-:h(\\d{0,})/:url(*)",
  async (clientRequest, clientResponse) => {
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
    const acceptsWebp = Boolean(accept && accept.indexOf("image/webp") !== -1);

    const finalWidth = width ? width : w;
    const finalHeight = width ? undefined : h;

    const cacheKey = `${escapeUrl(url)}-${finalWidth}-${finalHeight}-${
      acceptsWebp ? "webp" : "auto"
    }`;
    const metaFile = cacheKey + ".json";
    const cachePath = path.join(cacheDir, cacheKey);
    const cacheMetaPath = path.join(cacheDir, metaFile);

    const inCache = await fileExists(cachePath);
    if (inCache) {
      fs.readFile(cacheMetaPath, (err, buffer) => {
        clientResponse.sendFile(cachePath, {
          headers: {
            "Img-Cache": "HIT",
            "Cache-Control": "public, s-maxage=8640000",
            Vary: "Accept, DPR, Width",
            "Content-Type": acceptsWebp
              ? "image/webp"
              : JSON.parse(buffer.toString("utf8"))["content-type"],
          },
        });
      });
    } else {
      // File is not in disk cache.. fetch and resize..
      try {
        const originResponse = await fetch(url);

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
            console.log("info", url, info);
          });

        clientResponse.set("Cache-Control", "public, s-maxage=8640000");
        clientResponse.set("Vary", "Accept, DPR, Width");

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

        const resized = originResponse
          .pipe(convert) //
          .on("error", (err) => {
            console.error(err);
            clientResponse.sendStatus(500);
          });

        const s = resized.clone().pipe(clientResponse); // Send to client

        finished(s, (err) => {
          if (err) {
            console.error(111, err);
            return;
          }

          // Write resized image and metadata to cache
          fs.mkdtemp(path.join(os.tmpdir(), "img-dn-ht-"), (err, directory) => {
            if (err) throw err;
            const tempPath = path.join(directory, cacheKey);
            const tempMetaPath = path.join(directory, metaFile);

            fs.writeFile(
              tempPath + ".json",
              JSON.stringify({
                "content-type": originResponse.headers["content-type"],
              }),
              (err) => {
                if (err) throw err;

                const tempFile = fs.createWriteStream(tempPath);
                resized
                  .clone()
                  .pipe(tempFile)
                  .on("error", (err) => console.error(err))
                  .on("finish", () => {
                    // fs.rename(tempMetaPath, cacheMetaPath, (err) => {
                    //   if (err) console.error(err);
                    //   fs.rename(tempPath, cachePath, (err) => {
                    //     if (err) console.error(err);
                    //   });
                    // });
                  });
              }
            );
          });
        });
      } catch (err) {
        console.error("http fetch error", err);
        clientResponse.sendStatus(500);
      }
    }
  }
);

function fetch(url: string): Promise<request.Response> {
  return new Promise<request.Response>((resolve, reject) => {
    request(
      url,
      { headers: { Accept: "image/*", timeout: 10000 } },
      (err, originResponse) => {
        if (err) reject(err);

        resolve(originResponse);
      }
    );
  });
}

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
});
