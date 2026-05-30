const express = require("express");
const path = require("path");
const { HTML_PAGES } = require("../utils/constants");

const router = express.Router();

// Root route
router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../../public", "landing.html"));
});

// Static HTML pages
HTML_PAGES.forEach((page) => {
  router.get(`/${page}`, (req, res) => {
    res.sendFile(path.join(__dirname, "../../public", `${page}.html`));
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
  // Try multiple possible paths
  const possiblePaths = [
    path.join(__dirname, "../../public/blog", `${slug}.html`),
    path.join(__dirname, "../../public", `${slug}.html`),
    path.join(__dirname, "../../public/blog", slug, "index.html")
  ];
  
  for (const filePath of possiblePaths) {
    const fs = require("fs");
    if (fs.existsSync(filePath)) {
      return res.sendFile(filePath);
    }
  }
  
  res.status(404).send("Post not found");
});

module.exports = router;