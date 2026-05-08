{ config, pkgs, ... }:

{
  # Ensure that Docker or Podman is enabled on your NixOS server
  # virtualisation.docker.enable = true;
  # virtualisation.oci-containers.backend = "docker"; # or "podman"

  virtualisation.oci-containers.containers."chord-songs" = {
    # Replace this with the actual image name/tag.
    # If building locally on the server, ensure the image is built and available.
    # Alternatively, you can pull it from a container registry (e.g., ghcr.io/your-username/chord-songs:latest).
    image = "chord-songs:latest";

    # Map port 8000 on the host to port 8000 in the container
    ports = [
      "8000:8000"
    ];

    # Map the persistent content repository into the container.
    # IMPORTANT: Replace the host path with the actual absolute path to the
    # holy-songs-content checkout on the NixOS server. Mount the whole repo,
    # not only the songs directory, so the backend can commit and push changes.
    volumes = [
      "/absolute/path/to/holy-songs-content:/app/content-repo"
    ];

    environment = {
      ADMIN_PASSWORD = "change-me";
      SONGS_DIR = "/app/content-repo/songs";
      CONTENT_REPO_DIR = "/app/content-repo";
      SONGS_OUTPUT_DIR = "/app/dist/data";
      # Set this with a secret mechanism in real deployments.
      GITHUB_TOKEN = "";
      CONTENT_REPO_GIT_USER_NAME = "Holy Songs Bot";
      CONTENT_REPO_GIT_USER_EMAIL = "holy-songs-bot@local";
    };

    # Automatically start the container when the system boots
    # (equivalent to 'restart: unless-stopped' in docker-compose)
    autoStart = true;
  };
}
