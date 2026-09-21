export const site = {
  name: "kanade",
  title: "Feliz | Anime × Security × Technology",
  description: "Feliz personal blog about cybersecurity, programming, anime, open source projects and technology.",
  socialImage: "/themes/fuyukawa-kagari/assets/hero-wallpaper.webp",
  author: "Feliz",
  keywords: ["个人博客", "CTF", "Web Security", "开源", "开发工具", "AI"],
  nav: [
    { href: "/", label: "HOME", icon: "tabler:home-heart", hint: "front page" },
    { href: "/blog/", label: "BLOG", icon: "tabler:book-2", hint: "notes" },
    { href: "/projects/", label: "WORKS", icon: "tabler:code", hint: "projects" },
    { href: "/about/", label: "ME", icon: "tabler:user-heart", hint: "profile" }
  ]
};

export const categoryLabel: Record<string, string> = {
  tech: "技术开发",
  anime: "二次元",
  life: "日常记录"
};
