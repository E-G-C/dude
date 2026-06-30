# Hugo Template Functions

Portable reference of Hugo template functions grouped by namespace. Modern Hugo prefers the namespaced form (`strings.ToUpper`); many bare aliases still work (shown where common). The piped value becomes the final argument.

## cast — type conversion
`cast.ToFloat`, `cast.ToInt`, `cast.ToString`
- `{{ "42" | int }}`, `{{ "3.14" | float }}`, `{{ 42 | string }}`.

## collections — slices and maps
`After`, `Append`, `Apply`, `Complement`, `Delimit`, `Dictionary` (`dict`), `First` (`first`), `Group`, `In` (`in`), `IndexFunction` (`index`), `IsSet`, `KeyVals`, `Last` (`last`), `Merge`, `NewScratch`, `Querify`, `Reverse`, `Seq` (`seq`), `Shuffle`, `Slice` (`slice`), `Sort` (`sort`), `SymDiff`, `Union`, `Uniq` (`uniq`), `Where` (`where`)
- Filter: `{{ where .Site.RegularPages "Section" "blog" }}`, `{{ where .Pages "Params.featured" true }}`.
- Operators in `where`: `"=="`, `"!="`, `">"`, `">="`, `"<"`, `"<="`, `"in"`, `"not in"`, `"intersect"`, `"like"` (regex).
- Build map: `{{ dict "key" "val" "n" 1 }}`. Build slice: `{{ slice 1 2 3 }}`.
- `index`: `{{ index .Site.Data.menu "main" }}`. `seq`: `{{ seq 1 5 }}`.
- `Append`/`Merge` for combining; `Uniq`/`Union`/`Intersect`/`Complement`/`SymDiff` for set math.

## compare — comparison and defaults
`Conditional` (`cond`), `Default` (`default`), `Eq` (`eq`), `Ge` (`ge`), `Gt` (`gt`), `Le` (`le`), `Lt` (`lt`), `Ne` (`ne`)
- `{{ cond (gt .X 0) "pos" "neg" }}`, `{{ .Params.title | default .Title }}`.

## crypto — hashing
`crypto.HMAC`, `crypto.MD5`, `crypto.SHA1`, `crypto.SHA256`

## css — stylesheet pipelines
`css.Build` (esbuild bundling), `css.PostCSS`, `css.Sass` (`toCSS`), `css.TailwindCSS`, `css.Quoted`, `css.Unquoted`
- See the asset-pipeline skill for full Hugo Pipes usage.

## debug — diagnostics
`debug.Dump`, `debug.Timer`, `debug.VisualizeSpaces`
- `{{ debug.Dump . }}` prints a structure; pair with `templates.Current` to trace execution.

## diagrams — GoAT
`diagrams.Goat` — render ASCII diagrams to inline SVG.

## encoding
`encoding.Base64Decode`, `encoding.Base64Encode`, `encoding.Jsonify` (`jsonify`)

## fmt — printing and logging
`Errorf` (`errorf`), `Erroridf`, `Print` (`print`), `Printf` (`printf`), `Println` (`println`), `Warnf` (`warnf`), `Warnidf`
- `errorf` fails the build; `warnf` logs to console. Use `...idf` variants to suppress a specific warning by ID.
- Type-inspect: `{{ printf "%[1]v (%[1]T)" $value }}`.

## go-template — language keywords
`and`, `block`, `break`, `continue`, `define`, `else`, `end`, `if`, `len`, `not`, `or`, `range`, `return`, `template`, `try`, `urlquery`, `with`
- `try` returns an object with `.Err` and `.Value` for safe error handling: `{{ with try (resources.GetRemote $url) }}{{ with .Err }}...{{ else with .Value }}...{{ end }}{{ end }}`.

## hash
`hash.FNV32a`, `hash.XxHash`

## hugo — build and environment info
`hugo.Version`, `hugo.Environment`, `hugo.IsProduction`, `hugo.IsDevelopment`, `hugo.IsServer`, `hugo.IsExtended`, `hugo.IsMultilingual`, `hugo.IsMultihost`, `hugo.Generator`, `hugo.BuildDate`, `hugo.CommitHash`, `hugo.GoVersion`, `hugo.Deps`, `hugo.Sites`, `hugo.Store`, `hugo.WorkingDir`, `hugo.Data`
- `{{ hugo.Generator }}` emits the meta generator tag. Gate code with `{{ if hugo.IsProduction }}`.

## images — image filters (compose with `images.Filter` / `.Filter`)
`AutoOrient`, `Brightness`, `ColorBalance`, `Colorize`, `Config`, `Contrast`, `Dither`, `Filter`, `Gamma`, `GaussianBlur`, `Grayscale`, `Hue`, `Invert`, `Mask`, `Opacity`, `Overlay`, `Padding`, `Pixelate`, `Process`, `QR`, `Saturation`, `Sepia`, `Sigmoid`, `Text`, `UnsharpMask`
- `{{ $img := $img.Filter (images.Grayscale) (images.GaussianBlur 6) }}`.
- `images.QR` builds a QR code; `images.Text` overlays text.

## inflect
`inflect.Humanize`, `inflect.Pluralize`, `inflect.Singularize`

## js — JavaScript pipelines
`js.Build` (esbuild), `js.Babel`, `js.Batch`
- See the asset-pipeline skill.

## lang — localization and number formatting
`lang.Translate` (`T` / `i18n`), `lang.Merge`, `lang.FormatNumber`, `lang.FormatNumberCustom`, `lang.FormatCurrency`, `lang.FormatAccounting`, `lang.FormatPercent`
- `{{ i18n "wordCount" . }}`, `{{ lang.FormatCurrency 2 "USD" 1234.5 }}`.

## math
`Abs`, `Acos`, `Add` (`add`), `Asin`, `Atan`, `Atan2`, `Ceil`, `Cos`, `Counter`, `Div` (`div`), `Floor`, `Log`, `Max`, `MaxInt64`, `Min`, `Mod` (`mod`), `ModBool`, `Mul` (`mul`), `Pi`, `Pow`, `Product`, `Rand`, `Round`, `Sin`, `Sqrt`, `Sub` (`sub`), `Sum`, `Tan`, `ToDegrees`, `ToRadians`
- `{{ add 1 2 }}`, `{{ math.Round (div 10 3) }}`, `{{ math.Counter }}` (per-template counter).

## openapi3
`openapi3.Unmarshal` — parse an OpenAPI 3 spec resource.

## os — file system (build host)
`os.FileExists`, `os.Getenv`, `os.ReadDir`, `os.ReadFile`, `os.Stat`
- `{{ os.Getenv "HUGO_ENV" }}`. Reads are relative to the project root.

## partials
`partials.Include` (`partial`), `partials.IncludeCached` (`partialCached`)
- `{{ partial "head.html" . }}`; `{{ partialCached "menu.html" . .Section }}` (pass variant keys).

## path — virtual path helpers
`path.Base`, `path.BaseName`, `path.Clean`, `path.Dir`, `path.Ext`, `path.Join`, `path.Split`
- Always use `path.*` (forward-slash, virtual) for site paths; reserve `os` for the filesystem.

## reflect — type checks
`reflect.IsImageResource`, `reflect.IsImageResourceProcessable`, `reflect.IsImageResourceWithMeta`, `reflect.IsMap`, `reflect.IsPage`, `reflect.IsResource`, `reflect.IsSite`, `reflect.IsSlice`

## resources — global and remote assets
`Get`, `GetMatch`, `GetRemote`, `Match`, `ByType`, `Concat`, `Copy`, `ExecuteAsTemplate`, `Fingerprint`, `FromString`, `Minify`, `PostProcess`
- `{{ $css := resources.Get "css/main.css" | minify | fingerprint }}`.
- Wrap `resources.GetRemote` with `try`; branch on `.Err`, `.Value`, and nil before using the remote resource.

## safe — bypass escaping (use only with trusted input)
`safe.CSS`, `safe.HTML`, `safe.HTMLAttr`, `safe.JS`, `safe.JSStr`, `safe.URL`
- `{{ .Params.rawHTML | safe.HTML }}` — only for content you control.

## strings
`Chomp`, `Contains`, `ContainsAny`, `ContainsNonSpace`, `Count`, `CountRunes`, `CountWords`, `FindRe`, `FindRESubmatch`, `FirstUpper`, `HasPrefix`, `HasSuffix`, `Repeat`, `Replace`, `ReplacePairs`, `ReplaceRE`, `RuneCount`, `SliceString`, `Split`, `Substr`, `Title` (`title`), `ToLower` (`lower`), `ToUpper` (`upper`), `Trim`, `TrimLeft`, `TrimPrefix`, `TrimRight`, `TrimSpace`, `TrimSuffix`, `Truncate` (`truncate`)
- `{{ strings.TrimSuffix ".md" $name }}`, `{{ replaceRE "[0-9]+" "#" $s }}`, `{{ truncate 80 .Summary }}`.

## templates — template helpers
`templates.Current`, `templates.Defer`, `templates.Exists`, `templates.Inner`
- `templates.Defer` runs a block after the build (used with `resources.PostProcess`).
- `templates.Exists "_partials/foo.html"` guards optional partials.

## time
`time.AsTime`, `time.Duration`, `time.Format`, `time.In`, `time.Now`, `time.ParseDuration`
- `{{ time.Format "2006-01-02" .Date }}` (Go reference layout). See the methods reference for `.Date.*` calls.

## transform — content transforms
`CanHighlight`, `Emojify` (`emojify`), `Highlight` (`highlight`), `HighlightCodeBlock`, `HTMLEscape`, `HTMLtoMarkdown`, `Markdownify` (`markdownify`), `Plainify` (`plainify`), `PortableText`, `Remarshal`, `ToMath`, `Unmarshal`, `XMLEscape`
- `{{ transform.Unmarshal (resources.Get "data.csv") }}` reads CSV/JSON/TOML/YAML/XML.
- `{{ "## Heading" | markdownify }}`, `{{ transform.ToMath "a^2+b^2" }}` (KaTeX).

## urls
`AbsURL` (`absURL`), `RelURL` (`relURL`), `AbsLangURL`, `RelLangURL`, `Anchorize` (`anchorize`), `JoinPath`, `Parse`, `PathEscape`, `PathUnescape`, `Ref` (`ref`), `RelRef` (`relref`), `URLize` (`urlize`)
- `{{ "css/main.css" | absURL }}`, `{{ ref . "/about" }}`, `{{ urls.JoinPath "a" "b" }}`.

## Notes

- `html/template` escapes output by context; reach for `safe.*` only with trusted input.
- Function availability is the same across single and multilingual sites, but `lang.*`, `AbsLangURL`, and `RelLangURL` respect the current language.
- Dart Sass works with any Hugo edition when installed on `PATH`; embedded LibSass requires Extended and is deprecated. WebP encoding is supported in all current Hugo editions.
