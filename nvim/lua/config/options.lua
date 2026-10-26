-- Options are automatically loaded before lazy.nvim startup
-- Default options that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/options.lua
-- Add any additional options here

-- El SDK de macOS 27 trae un .tbd que el enlazador actual no entiende y rompe la
-- compilación de los parsers de tree-sitter; se usa el SDK 26.5 solo dentro de nvim.
local sdk = "/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk"
if vim.uv.fs_stat(sdk) then
  vim.env.SDKROOT = sdk
end
