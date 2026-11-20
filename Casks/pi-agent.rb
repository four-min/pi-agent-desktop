cask "pi-agent" do
  arch arm: "aarch64", intel: "x64"

  version "1.0.0"
  sha256 arm:   "440cea349d80f8852839a48e9795c39b3c366806f6574f3ba1c622269c5d03d2",
         intel: "f1f57dd969839b12f62dd982214101812dc6f046ae1fe599936e513f2a5438db"

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
