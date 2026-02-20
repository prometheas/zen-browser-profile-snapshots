{
  description = "zen-browser-profile-snapshots development shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            deno
            git
            jq
            sqlite
            zip
            unzip
            gnutar
            gzip
            coreutils
            findutils
            gnused
            gawk
            shellcheck
            just
          ];
        };
      });
}
