import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@fluentui/react-components';
import { Open16Regular } from '@fluentui/react-icons';
import { lexer } from 'marked';
import { useCanvasStyles } from './styles.js';

// Only an absolute web address becomes a link. Canvas serves no document files,
// so a relative link, an anchor, or any other scheme stays its text.
const WEB_LINK = /^https?:\/\//i;

/** The plain text of inline tokens, for a link's accessible name. @param {any[]} tokens @returns {string} */
const plain = tokens => tokens.map(token => (token.tokens ? plain(token.tokens) : token.text ?? '')).join('');

/**
 * One document's Markdown as React elements. marked's lexer tokens map to
 * elements, never through its HTML output, so every string reaches the page as
 * text: raw HTML and unknown tokens show their source, an image shows its alt
 * text, and nothing in the document is fetched or run. Headings sit under the
 * reader's h2, so # is h3.
 * @param {{ text: string }} props
 */
export function Markdown({ text }) {
  const s = useCanvasStyles();
  const tokens = useMemo(() => lexer(text), [text]);
  return <div className={s.markdown}>{blocks(tokens, s)}</div>;
}

/** @param {any[]} tokens @param {Record<string, string>} s */
function blocks(tokens, s) {
  return tokens.map((token, index) => block(token, index, s));
}

/** @param {any} token @param {number} key @param {Record<string, string>} s */
function block(token, key, s) {
  switch (token.type) {
    case 'heading': {
      const Heading = `h${Math.min(token.depth + 2, 6)}`;
      return <Heading key={key}>{inline(token.tokens, s)}</Heading>;
    }
    case 'paragraph': return <p key={key}>{inline(token.tokens, s)}</p>;
    case 'text': return <p key={key}>{token.tokens ? inline(token.tokens, s) : token.text}</p>;
    case 'list': {
      const List = token.ordered ? 'ol' : 'ul';
      // A tight item holds text tokens; a loose one holds paragraphs.
      return <List key={key} start={token.ordered && token.start !== 1 ? token.start : undefined}>
        {token.items.map((item, index) => <li key={index}>{item.tokens.map((child, at) => child.type === 'text'
          ? <React.Fragment key={at}>{child.tokens ? inline(child.tokens, s) : child.text}</React.Fragment>
          : block(child, at, s))}</li>)}
      </List>;
    }
    case 'blockquote': return <blockquote key={key}>{blocks(token.tokens, s)}</blockquote>;
    // A code block, or a block of raw HTML shown as its source.
    case 'code': case 'html': return <pre key={key} className={s.markdownCode}><code>{token.text}</code></pre>;
    case 'table': return <Table key={key} token={token} s={s} />;
    case 'hr': return <hr key={key} />;
    case 'space': case 'def': return null;
    default: return <p key={key}>{token.raw}</p>;
  }
}

/** @param {any[]} tokens @param {Record<string, string>} s */
function inline(tokens, s) {
  return tokens.map((token, key) => {
    switch (token.type) {
      case 'text': return token.tokens ? <React.Fragment key={key}>{inline(token.tokens, s)}</React.Fragment> : token.text;
      // The escaped character, the literal tag, or the image's alt text: nothing is loaded.
      case 'escape': case 'html': case 'image': return token.text;
      case 'strong': return <strong key={key}>{inline(token.tokens, s)}</strong>;
      case 'em': return <em key={key}>{inline(token.tokens, s)}</em>;
      case 'del': return <del key={key}>{inline(token.tokens, s)}</del>;
      case 'codespan': return <code key={key} className={s.markdownCodespan}>{token.text}</code>;
      case 'br': return <br key={key} />;
      case 'link': return WEB_LINK.test(token.href)
        // About's repository link: a new tab, named as one, with the open icon after the text.
        ? <Link key={key} inline href={token.href} target="_blank" rel="noopener noreferrer" className={s.aboutLink}
          aria-label={`${plain(token.tokens)} (opens in a new tab)`}>
          {inline(token.tokens, s)}<Open16Regular className={s.aboutLinkIcon} aria-hidden="true" />
        </Link>
        : <React.Fragment key={key}>{inline(token.tokens, s)}</React.Fragment>;
      default: return token.raw;
    }
  });
}

/**
 * A table scrolls sideways inside its own box when it is too wide. One that
 * cannot fit even at its narrowest gets readable columns (`data-wide`, set
 * outside React so it can be measured without), and only then is the box a
 * keyboard stop, as About's panel is only while it can scroll.
 * @param {{ token: any, s: Record<string, string> }} props
 */
function Table({ token, s }) {
  const box = useRef(null);
  const [wide, setWide] = useState(false);
  useLayoutEffect(() => {
    const node = box.current;
    const measure = () => {
      node.removeAttribute('data-wide');
      const fits = node.scrollWidth <= node.clientWidth + 1;
      node.toggleAttribute('data-wide', !fits);
      setWide(!fits);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  /** @param {'th'|'td'} Cell @param {any} entry @param {number} index */
  const cell = (Cell, entry, index) => <Cell key={index} scope={Cell === 'th' ? 'col' : undefined}
    style={entry.align ? { textAlign: entry.align } : undefined}>{inline(entry.tokens, s)}</Cell>;
  return <div ref={box} className={s.markdownTable} tabIndex={wide ? 0 : undefined} role={wide ? 'region' : undefined}
    aria-label={wide ? 'Table' : undefined}>
    <table>
      <thead><tr>{token.header.map((header, index) => cell('th', header, index))}</tr></thead>
      <tbody>{token.rows.map((row, index) => <tr key={index}>{row.map((data, at) => cell('td', data, at))}</tr>)}</tbody>
    </table>
  </div>;
}
