---
agent: agent
description: Scaffold a new Docsy blog post with correct front matter and image resources.
---

Create a new blog post under `blog/<YYYY>/`.

Ask for:
1. **Title**, **date** (default today, ISO 8601), **author** (free text).
2. Whether the post has **images** → use a leaf bundle (`blog/YYYY/my-post/index.md`) with images alongside.

Generate:
```yaml
---
title: <Title>
date: <YYYY-MM-DD>
author: <Name>
description: <One-line summary used in listing and SEO>
---
```

If there are images, add a `resources` block so they pick up captions:
```yaml
resources:
  - src: "**.{png,jpg}"
    title: "Image #:counter"
    params:
      byline: "Photo: <credit>"
```

Use `{{% imgproc <glob> Fit "800x" %}}caption{{% /imgproc %}}` to render images from the bundle.

Follow the [content authoring rules](../instructions/docsy-content.instructions.md).
