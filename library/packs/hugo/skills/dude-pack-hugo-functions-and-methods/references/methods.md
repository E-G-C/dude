# Hugo Object Methods

Portable reference of methods grouped by object. Methods are called on the current context (`.`) or a value you captured. The dot rebinds inside `range`/`with`; keep `$` for the page/root context.

## Page — `.` in single/list templates
Identity and kind: `Kind`, `Type`, `Layout`, `Section`, `Path`, `BundleType`, `IsHome`, `IsPage`, `IsSection`, `IsNode`, `Eq`, `Page`.
Content: `Content`, `ContentWithoutSummary`, `Summary`, `Truncated`, `Plain`, `PlainWords`, `RawContent`, `Render`, `RenderShortcodes`, `RenderString`, `TableOfContents`, `Fragments`, `HeadingsFiltered`, `HasShortcode`.
Titles/desc: `Title`, `LinkTitle`, `Description`, `Keywords`, `Params`, `Param`, `Data`, `Store`, `Scratch`.
Dates: `Date`, `Lastmod`, `PublishDate`, `ExpiryDate`, `Draft`, `GitInfo`, `CodeOwners`.
Counts: `WordCount`, `FuzzyWordCount`, `ReadingTime`, `Len`.
Navigation: `Next`, `Prev`, `NextInSection`, `PrevInSection`, `Parent`, `Ancestors`, `CurrentSection`, `FirstSection`, `InSection`, `IsAncestor`, `IsDescendant`, `Sections`, `Pages`, `RegularPages`, `RegularPagesRecursive`, `GetPage`, `GetTerms`.
URLs/output: `Permalink`, `RelPermalink`, `Ref`, `RelRef`, `Aliases`, `Slug`, `OutputFormats`, `AlternativeOutputFormats`, `Sitemap`, `File`, `Path`.
Pagination: `Paginate`, `Paginator`.
Menus: `HasMenuCurrent`, `IsMenuCurrent`.
i18n: `Language`, `Translations`, `AllTranslations`, `IsTranslated`, `TranslationKey`.
Resources: `Resources`, `Resize`, `Rotate` (on image page resources via `.Resources`).
Site: `Site`, `Sites`, `Weight`.
- `{{ range .Pages.ByDate.Reverse }}{{ .LinkTitle }}{{ end }}`.
- `{{ .Param "author" }}` checks page params then site params.
- `.Content` is rendered HTML; `.RawContent` is the source body; `.Plain` strips tags.

## Pages — a page collection (`.Pages`, `.Site.RegularPages`, `where ...`)
Sort: `ByDate`, `ByPublishDate`, `ByExpiryDate`, `ByLastmod`, `ByTitle`, `ByLinkTitle`, `ByWeight`, `ByLength`, `ByLanguage`, `ByParam`, `Reverse`.
Group: `GroupBy`, `GroupByDate`, `GroupByPublishDate`, `GroupByExpiryDate`, `GroupByLastmod`, `GroupByParam`, `GroupByParamDate`.
Slice/relate: `Limit`, `Next`, `Prev`, `Related`, `Len`.
- `{{ range (.Pages.GroupByDate "2006").Reverse }}<h2>{{ .Key }}</h2>...{{ end }}`.
- Chain after `where`: `{{ range (where .Site.RegularPages "Type" "post").ByDate.Reverse }}`.
- `.Related .` returns content similar to the current page (configure `[related]`).

## Site — `.Site`
Identity: `Title`, `BaseURL`, `Copyright`, `Config`, `Version`, `Params`, `Param`, `Store`, `Data`, `Role`, `Dimension`.
Pages: `Home`, `Pages`, `RegularPages`, `AllPages`, `Sections`, `MainSections`, `GetPage`, `Taxonomies`, `Lastmod`.
Menus/i18n: `Menus`, `Language`, `LanguagePrefix`, `Languages`, `IsDefault`, `Sites`.
Build: `BuildDrafts`.
- `{{ .Site.Params.author }}`, `{{ .Site.GetPage "/about" }}`, `{{ range .Site.Menus.main }}...{{ end }}`.
- `MainSections` powers "list the main content" without hardcoding section names.

## Resource — page/global/remote resources
Common: `Content`, `MediaType`, `ResourceType`, `Name`, `Title`, `Permalink`, `RelPermalink`, `Publish`, `Data`, `Params`, `Process`.
Images: `Width`, `Height`, `Resize`, `Fit`, `Fill`, `Crop`, `Filter`, `Colors`, `Exif`.
Meta: `Meta`.
- `{{ $img := (.Resources.Get "cover.jpg").Fill "1200x630 webp" }}`.
- For `resources.GetRemote`, wrap the call with `try`; branch on `.Err`, `.Value`, and nil before using the resource.
- Transformed images drop metadata; read `Exif`/`Meta` from the original.

## Taxonomy and Term
Taxonomy object: `Alphabetical`, `ByCount`, `Count`, `Get`, `Page`.
- `{{ range .Site.Taxonomies.tags.ByCount }}{{ .Page.Title }} ({{ .Count }}){{ end }}`.
- On a term page, `.Pages` lists tagged content; `.Data.Term` and `.Page.GetTerms` relate terms.

## Menu and Menu Entry
Menu: `ByName`, `ByWeight`, `Limit`, `Reverse`.
Menu Entry: `Name`, `Title`, `URL`, `Page`, `PageRef`, `Weight`, `Identifier`, `KeyName`, `Pre`, `Post`, `Params`, `Parent`, `Children`, `HasChildren`, `Menu`.
- `{{ range .Site.Menus.main.ByWeight }}<a href="{{ .URL }}">{{ .Name }}</a>{{ end }}`.
- Use `.HasChildren`/`.Children` for nested menus; `.Page` links a menu entry to its page.

## Pager (pagination)
`First`, `Last`, `Next`, `Prev`, `HasNext`, `HasPrev`, `Pagers`, `PageNumber`, `PagerSize`, `NumberOfElements`, `TotalNumberOfElements`, `TotalPages`, `PageGroups`, `Pages`, `URL`.
- `{{ $p := .Paginate .Pages }}{{ range $p.Pages }}...{{ end }}{{ template "_internal/pagination.html" . }}` → in v0.146+ use `{{ partial "pagination.html" . }}`.

## Output Format
`Name`, `MediaType`, `Permalink`, `RelPermalink`, `Rel`.
- `{{ range .AlternativeOutputFormats }}<link rel="{{ .Rel }}" href="{{ .Permalink }}">{{ end }}`.

## Shortcode — inside `_shortcodes/*.html`
`Get`, `Inner`, `InnerDeindent`, `IsNamedParams`, `Name`, `Ordinal`, `Page`, `Params`, `Parent`, `Position`, `Ref`, `RelRef`, `Scratch`, `Site`, `Store`.
- `{{ .Get 0 }}` (positional) or `{{ .Get "title" }}` (named). `{{ .Inner }}` is the body.
- `.Page` is the page calling the shortcode; `.Position` aids error messages.

## Time — on a time value (e.g. `.Date`)
`Format`, `Add`, `AddDate`, `After`, `Before`, `Equal`, `Sub`, `Year`, `Month`, `Day`, `Hour`, `Minute`, `Second`, `Nanosecond`, `Weekday`, `YearDay`, `Unix`, `UnixMilli`, `UnixMicro`, `UnixNano`, `UTC`, `Local`, `Round`, `Truncate`, `IsDST`, `IsZero`.
- `{{ .Date.Format "Monday, Jan 2, 2006" }}` (Go reference layout `Mon Jan 2 15:04:05 MST 2006`).

## Duration — on a duration value
`Hours`, `Minutes`, `Seconds`, `Milliseconds`, `Microseconds`, `Nanoseconds`, `Round`, `Truncate`, `Abs`.
- `{{ (time.ParseDuration "1h30m").Minutes }}`.

## Notes

- Method names are case-sensitive and have no parentheses unless they take arguments: `{{ .Title }}`, `{{ .GetPage "/x" }}`.
- `.Scratch` and `.Store` hold mutable per-page/per-shortcode state across template scopes; `.Store` is the newer, recommended API.
- Prefer collection methods (`ByDate`, `GroupByParam`, `where`) over manual loops for sorting/filtering performance and clarity.
