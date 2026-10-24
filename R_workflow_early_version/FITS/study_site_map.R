# ---- 1. Settings ------------------------------------------------------------
# Figure 1: map of the study area in northern Washington. Shows the two study
# sites (Okanogan and Northeast), the capture site of each animal, 50% of the GPS
# fixes, the main roads and rivers, the 49 N border with Canada, a 50 km scale
# bar and an inset locating the area within Washington State.
 
#
# INPUT : the two Movebank CSV files          (same names as in anim_00_config.R)
#         road_data/washington-260912.gpkg    OpenStreetMap lines layer (Geofabrik extract)
# OUTPUT: study_site_map.png                  7 x 3.9 inches at 300 dpi, in base_dir
# Packages: sf, ggplot2, dplyr, maps (the maps package supplies the Washington outline offline).
# Run order: independent of the other scripts; needs only the raw data.

base_dir   <- "C:/Users/Nic/Documents/ctmm/FITS"   # same folder as the other scripts
event_file <- "GPS tracking of bobcats and coyotes in northern Washington.csv"                  # GPS fixes
ref_file   <- "GPS tracking of bobcats and coyotes in northern Washington-reference-data.csv"   # one row per animal
osm_gpkg   <- file.path(base_dir, "road_data", "washington-260912.gpkg")
out_file   <- file.path(base_dir, "study_site_map.png")

FIX_FRACTION <- 0.5                  # share of GPS fixes drawn, to limit overplotting (stated in the caption)
MAP_LON <- c(-120.75, -117.15)       # map limits, degrees east
MAP_LAT <- c(47.85, 49.12)           # map limits, degrees north (top margin leaves room for the border labels)
SPECIES_COL <- c(Bobcat = "#E69F00", Coyote = "#0072B2")   # Okabe-Ito amber and blue, as on the page

library(sf)
library(dplyr)
library(ggplot2)
sf_use_s2(FALSE)   # treat longitude/latitude as flat coordinates, which is enough at this scale

# ---- 2. GPS fixes and capture sites ------------------------------------------------
ev  <- read.csv(file.path(base_dir, event_file), stringsAsFactors = FALSE)   # ev  = GPS fixes
ref <- read.csv(file.path(base_dir, ref_file),   stringsAsFactors = FALSE)   # ref = one row per animal

ev$visible <- as.logical(toupper(as.character(ev$visible)))   # stored as "true"/"false" text
ev <- ev[ev$visible %in% TRUE & !is.na(ev$location.long) & !is.na(ev$location.lat), ]   # drop fixes flagged as outliers
ev$species <- ifelse(grepl("rufus", ev$individual.taxon.canonical.name), "Bobcat", "Coyote")

set.seed(1)   # fixed seed so the same fixes are drawn every time
fixes <- ev %>%
  group_by(species) %>%
  slice_sample(prop = FIX_FRACTION) %>%   # random half of each species' fixes
  ungroup() %>%
  st_as_sf(coords = c("location.long", "location.lat"), crs = 4326)

capture <- ref %>%
  distinct(animal.id, .keep_all = TRUE) %>%   # one row per animal
  filter(!is.na(capture.longitude), !is.na(capture.latitude)) %>%
  mutate(species = ifelse(grepl("rufus", animal.taxon), "Bobcat", "Coyote")) %>%
  st_as_sf(coords = c("capture.longitude", "capture.latitude"), crs = 4326)

# ---- 3. Roads and rivers --------------------------------------------------------------
# Read only the lines inside the map area (plus a margin) and only the classes drawn.
study_box <- st_as_sfc(st_bbox(c(xmin = MAP_LON[1] - 0.3, xmax = MAP_LON[2] + 0.3,
                                 ymin = MAP_LAT[1] - 0.3, ymax = MAP_LAT[2] + 0.3), crs = st_crs(4326)))
roads_major <- st_read(osm_gpkg, quiet = TRUE, wkt_filter = st_as_text(study_box),
                       query = "SELECT * FROM lines WHERE highway IN ('motorway', 'trunk', 'primary')")
roads_minor <- st_read(osm_gpkg, quiet = TRUE, wkt_filter = st_as_text(study_box),
                       query = "SELECT * FROM lines WHERE highway = 'secondary'")
rivers <- st_read(osm_gpkg, quiet = TRUE, wkt_filter = st_as_text(study_box),
                  query = paste("SELECT * FROM lines WHERE waterway = 'river' AND name IN",
                                "('Columbia River', 'Okanogan River', 'Methow River', 'Spokane River',",
                                "'Pend Oreille River', 'Kettle River', 'Sanpoll River')"))

# ---- 4. Labels, scale bar and legend positions -------------------------------------------
towns <- data.frame(name = c("Omak", "Tonasket", "Okanogan", "Republic", "Colville", "Winthrop", "Chewelah", "Kettle Falls"),
                    lon  = c(-119.5266, -119.4386, -119.4461, -118.7380, -117.9055, -120.1779, -117.7194, -118.0580),
                    lat  = c(48.4112, 48.7040, 48.3660, 48.6490, 48.5460, 48.4774, 48.2763, 48.6100))
sites <- data.frame(label = c("Okanogan site", "Northeast site"), lon = c(-120.0, -117.95), lat = c(48.88, 48.88))

# Scale bar: 50 km, drawn in degrees of longitude at the latitude of the bar (lat in degrees; 1 degree of latitude = 111.32 km at the equator for longitude).
sb_lat <- 47.94; sb_x0 <- -119.3; sb_km <- 50   # bar sits below the legend
sb_dx  <- sb_km / (111.32 * cos(sb_lat * pi / 180))

# Legend drawn inside the map: one row per key, from the top down.
lg <- data.frame(label = c("Coyote (capture site, GPS fixes)", "Bobcat (capture site, GPS fixes)",
                           "Highway or primary road", "Secondary road", "River"),
                 y = 48.32 - 0.055 * (0:4))
lg_x <- -119.35   # left edge of the legend keys

# ---- 5. Inset: location within Washington State -----------------------------------------
wa <- st_as_sf(maps::map("state", "washington", plot = FALSE, fill = TRUE))   # state outline from the maps package
p_inset <- ggplot() +
  geom_sf(data = wa, fill = "white", colour = "grey30", linewidth = 0.3) +
  annotate("rect", xmin = MAP_LON[1], xmax = MAP_LON[2], ymin = MAP_LAT[1], ymax = MAP_LAT[2],
           fill = NA, colour = "black", linewidth = 0.4) +
  theme_void() +
  theme(panel.background = element_rect(fill = "white", colour = "grey30", linewidth = 0.3),
        plot.margin = margin(1, 1, 1, 1))

# ---- 6. Map ------------------------------------------------------------------------------
p <- ggplot() +
  geom_sf(data = rivers,      colour = "#7FA7C9", linewidth = 0.35) +
  geom_sf(data = roads_minor, colour = "grey70",  linewidth = 0.15) +
  geom_sf(data = roads_major, colour = "grey35",  linewidth = 0.3) +
  geom_hline(yintercept = 49, linetype = "dashed", colour = "grey40", linewidth = 0.3) +   # Canada-USA border
  annotate("text", x = -120.7, y = 49.065, label = "CANADA", hjust = 0, size = 2.3, colour = "grey30") +
  annotate("text", x = -120.7, y = 48.935, label = "UNITED STATES", hjust = 0, size = 2.3, colour = "grey30") +
  geom_sf(data = fixes, aes(colour = species), size = 0.1, alpha = 0.35, shape = 16, show.legend = FALSE) +
  scale_colour_manual(values = SPECIES_COL) +
  geom_sf(data = filter(capture, species == "Coyote"), shape = 21, fill = SPECIES_COL[["Coyote"]],
          colour = "white", size = 1.9, stroke = 0.4) +
  geom_sf(data = filter(capture, species == "Bobcat"), shape = 24, fill = SPECIES_COL[["Bobcat"]],
          colour = "white", size = 1.9, stroke = 0.4) +
  geom_point(data = towns, aes(lon, lat), shape = 15, size = 1.3, colour = "black") +
  geom_label(data = towns, aes(lon + 0.03, lat + 0.035, label = name), hjust = 0, size = 2.3, colour = "black",
             fill = alpha("white", 0.75), label.size = 0, label.padding = unit(0.6, "mm")) +   # white backing keeps names legible over roads
  geom_label(data = sites, aes(lon, lat, label = label), size = 3.2, fontface = "bold", colour = "black",
             fill = alpha("white", 0.8), label.size = 0) +
  # scale bar
  annotate("segment", x = sb_x0, xend = sb_x0 + sb_dx, y = sb_lat, yend = sb_lat, linewidth = 0.9, colour = "black") +
  annotate("label", x = sb_x0 + sb_dx / 2, y = sb_lat + 0.045, label = "50 km", size = 2.4,
           fill = "white", label.size = 0, label.padding = unit(0.5, "mm")) +
  # north arrow
  annotate("segment", x = -118.45, xend = -118.45, y = 47.89, yend = 47.99, linewidth = 0.5, colour = "black",
           arrow = arrow(length = unit(1.6, "mm"), type = "closed")) +
  annotate("text", x = -118.45, y = 48.025, label = "N", size = 2.6, fontface = "bold") +
  # legend box and keys
  annotate("rect", xmin = lg_x - 0.06, xmax = lg_x + 1.0, ymin = min(lg$y) - 0.04, ymax = max(lg$y) + 0.04,
           fill = "white", colour = "grey60", linewidth = 0.3) +
  annotate("point", x = lg_x + 0.07, y = lg$y[1], shape = 21, fill = SPECIES_COL[["Coyote"]], colour = "white", size = 1.9, stroke = 0.4) +
  annotate("point", x = lg_x + 0.07, y = lg$y[2], shape = 24, fill = SPECIES_COL[["Bobcat"]], colour = "white", size = 1.9, stroke = 0.4) +
  annotate("segment", x = lg_x, xend = lg_x + 0.14, y = lg$y[3], yend = lg$y[3], colour = "grey35", linewidth = 0.3) +
  annotate("segment", x = lg_x, xend = lg_x + 0.14, y = lg$y[4], yend = lg$y[4], colour = "grey70", linewidth = 0.3) +
  annotate("segment", x = lg_x, xend = lg_x + 0.14, y = lg$y[5], yend = lg$y[5], colour = "#7FA7C9", linewidth = 0.4) +
  annotate("text", x = lg_x + 0.2, y = lg$y, label = lg$label, hjust = 0, size = 2.3) +
  # inset
  annotation_custom(ggplotGrob(p_inset), xmin = -120.72, xmax = -119.95, ymin = 47.86, ymax = 48.2) +
  scale_x_continuous(breaks = seq(-120.5, -117.5, by = 0.5), labels = function(x) paste0(abs(x), "\u00B0W")) +
  scale_y_continuous(breaks = seq(48, 49, by = 0.2),         labels = function(x) paste0(x, "\u00B0N")) +
  coord_sf(xlim = MAP_LON, ylim = MAP_LAT, expand = FALSE, crs = 4326) +
  theme_bw(base_size = 8, base_family = "sans") +
  theme(panel.grid.major = element_line(colour = "grey92", linewidth = 0.25),
        panel.border     = element_rect(colour = "black", fill = NA, linewidth = 0.5),
        axis.title       = element_blank(),
        axis.text        = element_text(colour = "black", size = 6.5),
        plot.margin      = margin(4, 6, 2, 2))

ggsave(out_file, p, width = 7, height = 3.9, dpi = 300, bg = "white")
cat("Saved:", out_file, "\n")
