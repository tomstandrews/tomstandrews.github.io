// ========== CONFIGURATION ==========
const width = 800;
const height = 600;
const originalCenter = [5, 50]; // Geographic center of the projection
const originalParallels = [43, 62]; // Parallels for conic conformal projection
const originalScale = 1500; // Initial scale of the map
const originalTranslate = [width / 2, height / 2 - 50]; // Initial translation of the map

let currentIndex = 0; // Current index for animation through years
let intervalId = null; // Stores the ID for the animation interval
let selectedCountry = null; // Stores the currently zoomed-in country

let countries = []; // GeoJSON data for countries
let allCitiesData = []; // This will hold ALL city data (from transformed_city_data.json)
let fastestGrowingCitiesPerYear = {}; // This will hold the fastest growing city per year
let years = []; // Array of all years available in the data for animation
let radiusScale; // Scale for general city frequency (determines circle size)

// ========== SVG SETUP ==========
const svg = d3.select("#map")
  .attr("width", width)
  .attr("height", height);

// Clip path to prevent elements from drawing outside the map area
svg.append("clipPath")
  .attr("id", "clip-right")
  .append("rect")
  .attr("width", width)
  .attr("height", height);

// Group for map elements, with clip path applied
const mapGroup = svg.append("g")
  .attr("clip-path", "url(#clip-right)");

// Text element to display the current year
svg.append("text")
  .attr("id", "year-text")
  .attr("x", 20)
  .attr("y", 40)
  .attr("font-size", "32px")
  .attr("fill", "#333")
  .text("Year: ---"); // Initial placeholder

// Text element to display the name of the selected country
const countryLabel = svg.append("text")
  .attr("x", 20).attr("y", 80)
  .attr("font-size", "24px")
  .attr("fill", "#555");

// Initial geographic projection and path generator
let projection = createProjection(originalCenter, originalScale, originalTranslate, originalParallels);
let path = d3.geoPath().projection(projection);

// ========== BAR CHART SETUP ==========
const barSvg = d3.select("#bar-chart");
const barMargin = { top: 40, right: 20, bottom: 80, left: 50 };
const barWidth = +barSvg.attr("width") - barMargin.left - barMargin.right;
const barHeight = +barSvg.attr("height") - barMargin.top - barMargin.bottom;

const barGroup = barSvg.append("g")
  .attr("transform", `translate(${barMargin.left},${barMargin.top})`);

// Label for the bar chart
barSvg.append("text")
  .attr("x", barMargin.left).attr("y", 20)
  .attr("font-size", "16px")
  .attr("fill", "#333")
  .text("Top 5 Cities by Frequency");

// Scales for the bar chart
let xBarScale = d3.scaleBand().range([0, barWidth]).padding(0.1);
let yBarScale = d3.scaleLinear().range([barHeight, 0]);

// Axes for the bar chart
const xAxisGroup = barGroup.append("g")
  .attr("transform", `translate(0,${barHeight})`);
const yAxisGroup = barGroup.append("g");

// ========== FUNCTIONS ==========

/**
 * Creates a D3 conic conformal projection.
 * @param {Array} center - [longitude, latitude] of the projection's center.
 * @param {number} scale - Scale factor for the projection.
 * @param {Array} translate - [x, y] translation for the projection.
 * @param {Array} parallels - [latitude1, latitude2] for conic projection parallels.
 * @returns {d3.geoConicConformal} The configured projection.
 */
function createProjection(center, scale, translate, parallels) {
  return d3.geoConicConformal()
    .center(center)
    .parallels(parallels)
    .scale(scale)
    .translate(translate);
}

/**
 * Updates the year slider's value.
 * @param {number} year - The current year to set on the slider.
 */
function updateSlider(year) {
  const slider = document.getElementById("year-slider");
  if (slider) {
    slider.value = +year;
  }
}

/**
 * Updates the map visualization based on the current year.
 * Draws countries, cities, highlights the fastest growing city,
 * and updates the bar chart.
 */
function updateMap() {
  const year = years[currentIndex];
  d3.select("#year-text").text(`Year: ${year}`);

  const sliderYearText = document.getElementById("slider-year-text");
  if (sliderYearText) {
    sliderYearText.textContent = year;
  }

  updateSlider(year);

  // Filter cities for the current year, and optionally by selected country
  let citiesThisYear = allCitiesData.filter(d => d.Year === year);
  if (selectedCountry) {
    citiesThisYear = citiesThisYear.filter(d =>
      d3.geoContains(selectedCountry, [d.Longitude, d.Latitude])
    );
  }

  // Get the fastest growing city for the current year from its dedicated dataset
  const currentFastestCity = fastestGrowingCitiesPerYear[year];

  // Get the top 5 cities by frequency for the bar chart and labels
  const topCities = [...citiesThisYear].sort((a, b) => b.Frequency - a.Frequency).slice(0, 5);

  // Clear previous map elements before redrawing
  mapGroup.selectAll(".country").remove();
  mapGroup.selectAll(".city,.city-hit,.label,.label-line").remove();
  mapGroup.selectAll(".fastest-city-marker").remove();


  // Draw countries
  mapGroup.selectAll(".country")
    .data(countries)
    .enter()
    .append("path")
    .attr("class", "country")
    .attr("d", path)
    .attr("fill", "#ccc")
    .attr("stroke", "#333")
    .attr("stroke-width", 0.5)
    .style("cursor", "pointer")
    .on("click", (e, d) => zoomToCountry(d));

  // --- Draw ALL cities ---
  // Append invisible bigger circles as hit targets for easier selection
  const cityHits = mapGroup.selectAll(".city-hit")
    .data(citiesThisYear)
    .enter()
    .append("circle")
    .attr("class", "city-hit")
    .attr("cx", d => projection([d.Longitude, d.Latitude])[0])
    .attr("cy", d => projection([d.Longitude, d.Latitude])[1])
    .attr("r", d => radiusScale(d.Frequency || 1) * 3) // Bigger radius for hit area
    .attr("fill", "transparent")
    .style("cursor", "pointer")
    .on("mouseover", function(event, d) {
        // Highlight the visible circle associated with this hit area
        mapGroup.selectAll(".city")
          .filter(c => c.City === d.City)
          .transition()
          .duration(150)
          .attr("r", radiusScale(d.Frequency || 1) * 1.5) // Grow visible circle
          .attr("fill", "blue"); // Change visible circle fill to blue
    })
    .on("mouseout", function(event, d) {
        // Revert the visible circle
        mapGroup.selectAll(".city")
          .filter(c => c.City === d.City)
          .transition()
          .duration(150)
          .attr("r", radiusScale(d.Frequency || 1))
          .attr("fill", "red"); // Revert visible circle fill to red
    })
    .on("click", function(event, d) {
      stopAnimation(); // Stop animation on click
      showCityTrend(d.City, d.Latitude, d.Longitude, year, event); // Show trend popup
    });

  // Draw visible city circles on top (these are the 'normal' cities)
  mapGroup.selectAll(".city")
    .data(citiesThisYear)
    .enter()
    .append("circle")
    .attr("class", "city")
    .attr("cx", d => projection([d.Longitude, d.Latitude])[0])
    .attr("cy", d => projection([d.Longitude, d.Latitude])[1])
    .attr("r", d => radiusScale(d.Frequency || 1))
    .attr("fill", "red")
    .attr("opacity", 0.7)
    .style("pointer-events", "none"); // Disable pointer events here so events go to invisible hits


  // --- Highlight the Fastest Growing City (marker only, no label) ---
  if (currentFastestCity) {
      const [fastestX, fastestY] = projection([currentFastestCity.Longitude, currentFastestCity.Latitude]);

      mapGroup.append("circle")
          .attr("class", "fastest-city-marker")
          .attr("cx", fastestX)
          .attr("cy", fastestY)
          .attr("r", radiusScale(currentFastestCity.Frequency || 1)) // Same size as normal cities
          .attr("fill", "blue") // Blue color for highlighting
          .attr("opacity", 0.9)
          .style("pointer-events", "none"); // Not interactive
  }


  // --- Prepare label data for top 5 cities (only top 5 will have labels) ---
  const labelData = topCities.map(d => {
    const [x, y] = projection([d.Longitude, d.Latitude]);
    return { x, y, x0: x, y0: y, ...d }; // x0, y0 are original positions for force to return to
  });

  // Run force simulation for label collision avoidance
  // Increased forceCollide radius for more separation
  const simulation = d3.forceSimulation(labelData)
    .force("collide", d3.forceCollide(20)) // Adjust radius as needed (e.g., 20-30) for more space
    .force("x", d3.forceX(d => d.x0).strength(0.2)) // Pulls labels towards their original x-coordinate
    .force("y", d3.forceY(d => d.y0).strength(0.2)) // Pulls labels towards their original y-coordinate
    .stop(); // Stop the simulation to manually run it for a fixed number of ticks

  // Run simulation for fixed ticks to allow labels to settle
  for (let i = 0; i < 300; ++i) simulation.tick();

  // Append labels with offset (shift right and up a bit)
  mapGroup.selectAll(".label")
    .data(labelData)
    .enter()
    .append("text")
    .attr("class", "label")
    .attr("x", d => d.x + 5)
    .attr("y", d => d.y - 5)
    .text(d => d.City)
    .attr("font-size", "12px")
    .attr("fill", "black") // Plain black color
    .style("pointer-events", "none"); // Disable pointer events on labels

  // Append lines connecting labels to city centers
  mapGroup.selectAll(".label-line")
    .data(labelData)
    .enter()
    .append("line")
    .attr("class", "label-line")
    .attr("x1", d => d.x0)
    .attr("y1", d => d.y0)
    .attr("x2", d => d.x)
    .attr("y2", d => d.y)
    .attr("stroke", "#999") // Gray color for lines
    .attr("stroke-width", 0.5)
    .style("pointer-events", "none");

  // Bar Chart Update (for top 5 cities by Frequency)
  xBarScale.domain(topCities.map(d => d.City));
  yBarScale.domain([0, d3.max(topCities, d => d.Frequency)]);

  xAxisGroup.call(d3.axisBottom(xBarScale))
    .selectAll("text")
    .attr("transform", "rotate(-45)")
    .style("text-anchor", "end");

  yAxisGroup.call(d3.axisLeft(yBarScale));

  const bars = barGroup.selectAll(".bar").data(topCities, d => d.City);

  // Enter selection for new bars
  bars.enter()
    .append("rect")
    .attr("class", "bar")
    .attr("x", d => xBarScale(d.City))
    .attr("width", xBarScale.bandwidth())
    .attr("y", barHeight) // Start from bottom
    .attr("height", 0) // Start with zero height for animation
    .attr("fill", "#69b3a2") // Bar color
    .transition()
    .duration(500)
    .attr("y", d => yBarScale(d.Frequency))
    .attr("height", d => barHeight - yBarScale(d.Frequency));

  // Update selection for existing bars
  bars.transition()
    .duration(500)
    .attr("x", d => xBarScale(d.City))
    .attr("y", d => yBarScale(d.Frequency))
    .attr("height", d => barHeight - yBarScale(d.Frequency))
    .attr("width", xBarScale.bandwidth());

  // Exit selection for removed bars
  bars.exit().remove();

  // Labels for the bar chart bars
  const barLabels = barGroup.selectAll(".bar-label").data(topCities, d => d.City);

  barLabels.enter()
    .append("text")
    .attr("class", "bar-label")
    .attr("x", d => xBarScale(d.City) + xBarScale.bandwidth() / 2)
    .attr("y", d => yBarScale(d.Frequency) - 5) // Position above the bar
    .text(d => d.Frequency)
    .attr("font-size", "10px")
    .attr("text-anchor", "middle");

  barLabels.transition()
    .duration(500)
    .attr("x", d => xBarScale(d.City) + xBarScale.bandwidth() / 2)
    .attr("y", d => yBarScale(d.Frequency) - 5)
    .text(d => d.Frequency);

  barLabels.exit().remove();
}

/**
 * Starts the animation loop.
 */
function startAnimation() {
  if (!intervalId) {
    intervalId = setInterval(() => {
      currentIndex = (currentIndex + 1) % years.length; // Loop through years
      console.log("Animation index:", currentIndex, years[currentIndex]); // Debug
      updateMap();
    }, 1500); // Update every 1.5 seconds
  }
}

/**
 * Stops the animation loop.
 */
function stopAnimation() {
  clearInterval(intervalId);
  intervalId = null;
}

/**
 * Resets the map view and restarts animation from the beginning.
 */
function resetView() {
  stopAnimation();
  currentIndex = 0; // Reset to the first year
  selectedCountry = null; // Clear selected country
  countryLabel.text(""); // Clear country label

  // Reset projection to original state
  projection = createProjection(originalCenter, originalScale, originalTranslate, originalParallels);
  path = d3.geoPath().projection(projection);

  updateMap();
  startAnimation();
}

/**
 * Zooms out the map to the original full Europe view.
 */
function zoomOut() {
  selectedCountry = null; // Clear selected country
  countryLabel.text(""); // Clear country label

  // Reset projection to original state
  projection = createProjection(originalCenter, originalScale, originalTranslate, originalParallels);
  path = d3.geoPath().projection(projection);

  updateMap(); // Update map after zoom out
}

/**
 * Zooms the map to a specific country.
 * @param {object} country - The GeoJSON object of the country to zoom to.
 */
function zoomToCountry(country) {
  stopAnimation(); // Stop animation on zoom
  selectedCountry = country; // Set selected country
  countryLabel.text(`Country: ${country.properties.NAME || "Unknown"}`); // Update country label

  // Calculate bounds and scale for zooming
  const [[x0, y0], [x1, y1]] = d3.geoBounds(country);
  const scale = Math.min(
    originalScale * (360 / (x1 - x0)) * 0.1,
    originalScale * (180 / (y1 - y0)) * 0.125
  );

  // Create new projection centered on the country
  projection = createProjection(
    [(x0 + x1) / 2, (y0 + y1) / 2], // Center of the country
    scale, // Calculated scale
    [width / 2, height / 2], // Translate to center in SVG
    originalParallels // Keep original parallels
  );
  path = d3.geoPath().projection(projection);
  updateMap(); // Update map after zoom
  startAnimation(); // Restart animation
}

/**
 * Displays a historical trend popup for a clicked city.
 * @param {string} cityName - The name of the city.
 * @param {number} lat - Latitude of the city.
 * @param {number} lon - Longitude of the city.
 * @param {number} currentYear - The year the city was clicked on the map.
 * @param {Event} event - The D3 event object from the click.
 */
function showCityTrend(cityName, lat, lon, currentYear, event) {
  // Remove any existing popup
  d3.select("#trend-popup").remove();
  d3.select("body").on("click.trend-popup", null); // Clear previous click listener

  // Filter city data from the ALL CITIES dataset and sort by year
  const cityData = allCitiesData
    .filter(d => d.City === cityName)
    .sort((a, b) => a.Year - b.Year);

  if (cityData.length === 0) {
      console.warn(`No historical data found for city ${cityName}.`);
      return;
  }

  // Find index of currentYear, fallback to last year if not found
  let trendCurrentIndex = cityData.findIndex(d => d.Year === currentYear);
  if (trendCurrentIndex === -1) {
    console.warn(`Current year ${currentYear} not found for city ${cityName} in trend data, showing last 5 years up to latest.`);
    trendCurrentIndex = cityData.length - 1; // Fallback to the latest available data
  }

  // Calculate start and end indices for last 5 years of data
  const endIndex = trendCurrentIndex;
  const startIndex = Math.max(0, endIndex - 4); // Show up to 5 data points

  // Slice the data for last 5 years only
  const recentData = cityData.slice(startIndex, endIndex + 1);

  console.log(`Showing years for city ${cityName}:`, recentData.map(d => d.Year));

  // Create and style the popup div
  const popup = d3.select("body")
    .append("div")
    .attr("id", "trend-popup")
    .style("position", "absolute")
    .style("left", `${event.pageX + 20}px`)
    .style("top", `${event.pageY}px`)
    .style("background", "white")
    .style("border", "1px solid #aaa")
    .style("padding", "10px")
    .style("box-shadow", "0 4px 10px rgba(0,0,0,0.3)")
    .style("z-index", 10000)
    .style("pointer-events", "auto"); // Allow interactions with the popup

  popup.append("h4").text(`Trend for ${cityName}`);

  // SVG setup for popup trend chart
  const svgWidth = 300;
  const svgHeight = 150;
  const margin = { top: 20, right: 10, bottom: 30, left: 40 };
  const width = svgWidth - margin.left - margin.right;
  const height = svgHeight - margin.top - margin.bottom;

  const popupSvg = popup.append("svg")
    .attr("width", svgWidth)
    .attr("height", svgHeight);

  const g = popupSvg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);

  // X scale based on recentData years
  const x = d3.scaleBand()
    .domain(recentData.map(d => d.Year))
    .range([0, width])
    .padding(0.1);

  // Y scale based on recentData frequencies
  const y = d3.scaleLinear()
    .domain([0, d3.max(recentData, d => d.Frequency)]).nice()
    .range([height, 0]);

  // Axes for the trend chart
  g.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d"))); // Format year as integer

  g.append("g").call(d3.axisLeft(y));

  // Bars for the trend chart
  g.selectAll(".bar")
    .data(recentData)
    .enter()
    .append("rect")
    .attr("class", "bar")
    .attr("x", d => x(d.Year))
    .attr("y", d => y(d.Frequency))
    .attr("width", x.bandwidth())
    .attr("height", d => height - y(d.Frequency))
    .attr("fill", "#69b3a2");

  // Close popup when clicking outside after a small delay to avoid immediate closure
  setTimeout(() => {
    d3.select("body").on("click.trend-popup", function (e) {
      const popupEl = document.getElementById("trend-popup");
      if (popupEl && !popupEl.contains(e.target)) {
        popupEl.remove();
        d3.select("body").on("click.trend-popup", null); // Remove listener
      }
    });
  }, 50);
}


// ========== DATA LOADING AND INITIALIZATION ==========
Promise.all([
  d3.json("/static/data/europe.topojson"), // Load Europe map data
  d3.json("/static/data/transformed_city_data.json"), // Load your full city data
  d3.json("/static/data/fastest_growing_cities.json") // Load fastest growing city data
]).then(([mapData, rawCityData, fastestGrowingData]) => {
  countries = topojson.feature(mapData, mapData.objects.europe).features;

  // Process rawCityData into a flat array of city objects for ALL cities
  allCitiesData = [];
  for (const year in rawCityData) {
    if (rawCityData.hasOwnProperty(year)) {
      const citiesInYear = rawCityData[year];
      if (Array.isArray(citiesInYear)) {
          for (const cityInfoDict of citiesInYear) {
              for (const cityName in cityInfoDict) {
                  if (cityInfoDict.hasOwnProperty(cityName)) {
                      const cityInfo = cityInfoDict[cityName];
                      allCitiesData.push({
                          City: cityName,
                          Year: +year, // Ensure year is a number
                          Latitude: cityInfo.Latitude,
                          Longitude: cityInfo.Longitude,
                          Frequency: cityInfo.Frequency
                      });
                  }
              }
          }
      } else {
          // Fallback in case rawCityData structure varies (less common)
          for (const cityName in citiesInYear) {
               if (citiesInYear.hasOwnProperty(cityName)) {
                    const cityInfo = citiesInYear[cityName];
                    allCitiesData.push({
                        City: cityName,
                        Year: +year,
                        Latitude: cityInfo.Latitude,
                        Longitude: cityInfo.Longitude,
                        Frequency: cityInfo.Frequency
                    });
                }
          }
      }
    }
  }
  console.log("Loaded allCitiesData (first 10):", allCitiesData.slice(0, 10));

  // Store the directly loaded fastest growing city data
  fastestGrowingCitiesPerYear = fastestGrowingData;
  console.log("Loaded fastestGrowingCitiesPerYear:", fastestGrowingCitiesPerYear);

  // Derive 'years' array from ALL cities data to cover the full historical range
  years = [...new Set(allCitiesData.map(d => d.Year))].sort((a, b) => a - b);
  console.log("Derived years for animation (from allCitiesData):", years);

  // Define the radius scale for city circles based on their frequency
  radiusScale = d3.scaleSqrt()
    .domain([1, d3.max(allCitiesData, d => d.Frequency || 1)]) // Domain from 1 to max frequency
    .range([1, 15]); // Output radius range (pixels)

  // Configure the year slider
  const slider = document.getElementById("year-slider");
  if (slider) {
    slider.min = d3.min(years);
    slider.max = d3.max(years);
    slider.step = 1;
    slider.value = years[0]; // Set initial slider value to the first year

    slider.addEventListener("input", (event) => {
      stopAnimation(); // Stop animation when slider is manually adjusted
      const selectedYear = +event.target.value;
      const index = years.findIndex(y => y === selectedYear);

      if (index !== -1) {
        currentIndex = index;
        updateMap(); // Update map to the selected year
      } else {
        console.warn(`Slider selected year ${selectedYear} not found in data.`);
      }
    });
  }

  // Append control buttons (assuming a div with id="controls" exists in your HTML)
  const controls = d3.select("#controls");
  controls.append("button").text("Start").on("click", startAnimation);
  controls.append("button").text("Stop").on("click", stopAnimation);
  controls.append("button").text("Reset").on("click", resetView);
  controls.append("button").text("Zoom Out").on("click", zoomOut);
  controls.append("button").text("Previous").on("click", () => {
    stopAnimation();
    currentIndex = Math.max(0, currentIndex - 1); // Go to previous year
    updateMap();
  });
  controls.append("button").text("Next").on("click", () => {
    stopAnimation();
    currentIndex = Math.min(years.length - 1, currentIndex + 1); // Go to next year
    updateMap();
  });

  // Initial map update and start animation when data is loaded
  updateMap();
  startAnimation();
}).catch(error => {
    console.error("Error loading data:", error);
});