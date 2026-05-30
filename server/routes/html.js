const express = require("express");
const path = require("path");
const { HTML_PAGES } = require("../utils/constants");

const router = express.Router();

// Root route - FIXED: use __dirname for absolute path
router.get("/", (req, res) => {
  const landingPath = path.join(__dirname, "../../public", "landing.html");
  res.sendFile(landingPath);
});

// Static HTML pages
HTML_PAGES.forEach((page) => {
  router.get(`/${page}`, (req, res) => {
    const filePath = path.join(__dirname, "../../public", `${page}.html`);
    res.sendFile(filePath);
  });
});

// Demo route
router.get("/demo/:slug", (req, res) => {
  const demoPath = path.join(__dirname, "../../public", "demo.html");
  res.sendFile(demoPath);
});

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