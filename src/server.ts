import express from "express";
import sharp from "sharp";
import request from "request";
import path from "path";
import fs from "fs";
import os from "os";

const cacheDir = path.join(path.dirname(__filename), "..", "image_cache");
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir);
}

const app = express();

const escapeUrl = (s: string) => Buffer.from(s).toString("base64");

app.enable("strict routing");

app.get("/", (req, res) => {
  res.send("HEALTHY");
});

app.get("/img", (req, res) => {
  res.send(
    `
    <meta http-equiv="Accept-CH" content="DPR, Width">
    <img width="500px" sizes="500px" src="/img/s/-/https://dn.ht/journal/photos/roll1/000031-8.jpg" />
    `
  );
});

app.get("/img/:sig/:w(\\d{0,})-:h(\\d{0,})/:url(*)", (req, res) => {
  const widthHeader = req.get("Width");
  const dprHeader = req.get("DPR");

  const url = req.params.url;

  if (!url.startsWith("https://dn.ht/")) {
    return res.sendStatus(400);
  }

  res.set("Accept-CH", "Width, DPR");

  const width = widthHeader ? Number.parseInt(widthHeader, 10) : undefined;
  const accept = req.get("Accept");

  const dpr = dprHeader ? Number.parseFloat(dprHeader) : 1.0;
  const w = req.params.w ? dpr * Number.parseInt(req.params.w, 10) : undefined;
  const h = req.params.h ? dpr * Number.parseInt(req.params.h, 10) : undefined;
  const acceptsWebp = Boolean(accept && accept.indexOf("image/webp") !== -1);

  const finalWidth = width ? width : w;
  const finalHeight = width ? undefined : h;

  const cacheKey = `${escapeUrl(url)}-${finalWidth}-${finalHeight}-${
    acceptsWebp ? "webp" : "auto"
  }`;
  const metaFile = cacheKey + ".json";
  const cachePath = path.join(cacheDir, cacheKey);
  const cacheMetaPath = path.join(cacheDir, metaFile);

  fs.access(cachePath, fs.constants.F_OK | fs.constants.R_OK, (err) => {
    if (!err) {
      fs.readFile(cacheMetaPath, (err, buffer) => {
        const data = buffer.toString("utf8");
        const meta = JSON.parse(data);
        const originContentType = meta["content-type"];

        res.sendFile(cachePath, {
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
      request(url, { headers: { Accept: "image/*", timeout: 10000 } })
        .on("error", (error) => {
          console.error("origin error", error);
          res.sendStatus(500);
        })
        .on("response", (originResponse) => {
          if (originResponse.statusCode !== 200) {
            console.log("origin status", originResponse.statusCode); // 200
            console.log(
              "origin content type",
              originResponse.headers["content-type"]
            );

            return res
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
              res.sendStatus(500);
            })
            .on("info", function (info) {
              // console.log("info", info);
            });

          if (acceptsWebp) {
            res.set("Content-Type", "image/webp");
            convert.webp({
              smartSubsample: true,
            });
          } else {
            res.set("Content-Type", originResponse.headers["content-type"]);
          }

          res.set("Cache-Control", "public, s-maxage=8640000");
          res.set("Vary", "Accept, DPR, Width");

          const resized = originResponse.pipe(convert).on("error", (err) => {
            if (err) console.error(err);
            res.sendStatus(500);
          });

          resized.pipe(res);

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
                resized.pipe(tempFile).on("finish", () => {
                  fs.rename(tempMetaPath, cacheMetaPath, (err) => {
                    if (err) console.error(err);
                    fs.rename(tempPath, cachePath, (err) => {
                      if (err) console.error(err);
                    });
                  });
                });
              }
            );
          });
        });
    }
  });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
});
