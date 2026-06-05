# Tokenmon Menu Bar Icon Options

These are small, monochrome template-icon candidates for the macOS menu bar extra, not full app icons. They are designed as 18x18 glyphs with black strokes/fills on transparency so macOS can tint them for light, dark, and selected menu bar states.

Apple guidance used:

- Menu bar extras expose app-specific functionality with an icon in the menu bar, even when the app is not frontmost.
- Interface icons and symbols should use black and clear colors so the system can apply the right appearance in light, dark, and selected states.
- SF Symbols are a good reference for weight, optical balance, and simple geometry.

Sources:

- https://developer.apple.com/design/human-interface-guidelines/the-menu-bar
- https://developer.apple.com/design/human-interface-guidelines/icons
- https://developer.apple.com/design/human-interface-guidelines/sf-symbols

## Candidates

1. `tokenmon-token-face.svg`
   - Best default direction.
   - Reads as "token + little creature" without being too playful.
   - Strong at menu bar size because it has one enclosing shape and only two facial details.

2. `tokenmon-monster-head.svg`
   - Closest to the current desktop-pet identity.
   - More characterful, but slightly less Apple-like because antenna/horn details add visual noise.

3. `tokenmon-usage-ring.svg`
   - Best for "usage monitor" semantics.
   - The ring implies refresh/live tracking; the face keeps it Tokenmon-specific.

4. `tokenmon-feed-bolt.svg`
   - Best for "token energy / feeding" semantics.
   - Very legible, but less obviously a pet.

5. `tokenmon-dual-pets.svg`
   - Best if the menu item should communicate Claude + Codex at once.
   - Least recommended for production menu bar use because dual subjects get crowded at 18px.

## Recommendation

Use `tokenmon-token-face.svg` as the default tray direction. It is the best compromise between Apple-style restraint and Tokenmon's product concept.

For Electron production, export the selected SVG to black transparent PNG at 18x18 and 36x36, name it with `Template` or call `nativeImage.setTemplateImage(true)`, then set it on the `Tray`. Avoid colored PNGs for menu bar extras.
