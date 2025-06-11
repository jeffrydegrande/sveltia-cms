I need a system to help me build carousel. A carousel is made by adding the
following code to my posts:

```html
{{{< carousel >}}
/uploads/raizesespirituais1.jpg
/uploads/raizesespirituais2.jpg
/uploads/raizesespirituais3.jpg
/uploads/raizesespirituais4.jpg
/uploads/raizesespirituais5.jpg
/uploads/raizesespirituais6.jpg
/uploads/raizesespirituais7.jpg
/uploads/raizesespirituais8.jpg
/uploads/raizesespirituais9.jpg
/uploads/raizesespirituais10.jpg
{{< /carousel >}}
```

What we have here is the opening and closing tags for the carousel, and then a
list of images in between. These can be paths, like in the example, or they can
be URLs.

I want to leverage the media library to build this:

- it already supports selecting multiple images
- it already supports uploading images
- it has tools like "Copy" e.a. already

What I would like is an extra button or Menu item "Make Carousel from selection"
or something like (that's a bit long). When clicked, it would take the currently
selected images and generate the carousel post, displaying it in the sidebar
where image details are shown. It would be displayed as code, i.e.
`<pre><code>...</code></pre>` etc with a "copy" button in the top right corner
allowing to copy the code to the clipboard.
