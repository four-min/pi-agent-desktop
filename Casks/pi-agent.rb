cask "pi-agent" do
  arch arm: "aarch64", intel: "x64"

  version "1.0.1"
  sha256 arm:   "7151dfbc838a793ee5d8a636b895e3df6fc3ada0b1c1204aaea96ebe4c04d875",
         intel: "965079295402cc7ef82a11c2bcd108c2a9f2cc81448a6f24b7d784e13e4cfc57"

  url "https://github.com/four-min/pi-agent-desktop/releases/download/v#{version}/Pi.Harness_#{version}_macOS_#{arch}.dmg"
  name "Pi Harness"
  desc "Local AI agent desktop app built on pi"
  homepage "https://github.com/four-min/pi-agent-desktop"

  livecheck do
    url :url
    strategy :github_latest
  end

  # The app upgrades itself from Settings with signed updater builds.
  auto_updates true
  # The app builds against macOS 11 (Tauri `minimumSystemVersion`), which is also
  # Homebrew's own floor, so a bare `depends_on :macos` is the whole requirement.
  depends_on :macos

  app "Pi Harness.app"

  # Sessions, models and credentials live in ~/.pi and are shared with the pi
  # CLI, so they are deliberately not part of zap.
  zap trash: [
    "~/Library/Application Support/com.fourmin.pi-harness",
    "~/Library/Caches/com.fourmin.pi-harness",
    "~/Library/Preferences/com.fourmin.pi-harness.plist",
    "~/Library/Saved Application State/com.fourmin.pi-harness.savedState",
    "~/Library/WebKit/com.fourmin.pi-harness",
  ]
end
