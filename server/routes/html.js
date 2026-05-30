const express = require("express");
const path = require("path");
const { HTML_PAGES } = require("../utils/constants");

const router = express.Router();

// Static HTML pages
HTML_PAGES.forEach((page) => {
  router.get(`/${page}`, (req, res) => {
    res.sendFile(path.resolve("public", `${page}.html`));
  });
});

router.get("/", (req, res) => res.sendFile(path.resolve("public", "landing.html")));
router.get("/demo/:slug", (req, res) => res.sendFile(path.resolve("public", "demo.html")));

// Dynamic blog posts
router.get("/blog/:slug", (req, res) => {
  const slug = req.params.slug;
  if (slug.includes("..") || slug.includes("/")) {
    return res.status(400).send("Invalid slug");
  }
  const filePath = path.join(__dirname, "../../public", `${slug}.html`);
  res.sendFile(filePath, (err) => {
    if (err) res.status(404).send("Post not found");
  });
});

module.exports = router;