import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UnsupportedVersionBanner } from './UnsupportedVersionBanner';

describe('UnsupportedVersionBanner', () => {
  it('renders nothing for an exactly-supported version', () => {
    const { container } = render(<UnsupportedVersionBanner mcVersion="1.21.1" modLoader="NeoForge" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for a same-version loader-miss (mild fallback)', () => {
    // 1.20.1 + quilt resolves same-version (1.20.1), so no banner — version
    // facts stay correct; only the loader differs.
    const { container } = render(<UnsupportedVersionBanner mcVersion="1.20.1" modLoader="Quilt" />);
    expect(container.firstChild).toBeNull();
  });

  it('warns for a minor version that falls cross-version to the default card', () => {
    render(<UnsupportedVersionBanner mcVersion="1.20.4" modLoader="Forge" />);
    expect(screen.getByText(/Unsupported Minecraft version \(1\.20\.4\)/)).toBeTruthy();
    expect(screen.getByText(/1\.21\.1\/neoforge/)).toBeTruthy();
  });

  it('warns for an unknown major version', () => {
    render(<UnsupportedVersionBanner mcVersion="1.19.2" modLoader="Forge" />);
    expect(screen.getByText(/Unsupported Minecraft version \(1\.19\.2\)/)).toBeTruthy();
  });
});
