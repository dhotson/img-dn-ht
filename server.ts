import express from "express";
import sharp from "sharp";
import request from "request";

const app = express();

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
  const width = widthHeader ? Number.parseInt(widthHeader, 10) : undefined;

  const dpr = dprHeader ? Number.parseFloat(dprHeader) : 1.0;
  const w = req.params.w ? dpr * Number.parseInt(req.params.w, 10) : undefined;
  const h = req.params.h ? dpr * Number.parseInt(req.params.h, 10) : undefined;

  res.set("Accept-CH", "Width, DPR");

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
        .resize({
          width: width ? width : w,
          height: width ? undefined : h,
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

      const accept = req.get("Accept");
      if (accept && accept.indexOf("image/webp") !== -1) {
        res.set("Content-Type", "image/webp");
        convert.webp({
          smartSubsample: true,
        });
      } else {
        res.set("Content-Type", originResponse.headers["content-type"]);
      }

      res.set("Cache-Control", "public, s-max-age=8640000");
      res.set("Vary", "Accept, DPR, Width");

      originResponse
        .pipe(convert)
        .pipe(res)
        .on("error", (e) => {
          console.error(e);
          res.sendStatus(500);
        });
    });
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Listening on ${PORT}`);
});
