// ========== CONFIGURATION ==========
const width = 800;
const height = 600;
const originalCenter = [5, 50];
const originalParallels = [43, 62];
const originalScale = 1500;
const originalTranslate = [width / 2, height / 2 - 50];

let currentIndex = 0;
let intervalId = null;
let selectedCountry = null;

let countries = [];
let cities = [];
let years = [];
let radiusScale;

// ========== SVG SETUP ==========
const svg = d3.select("#map")
  .attr("width", width)
  .attr("height", height);

svg.append("clipPath")
  .attr("id", "clip-right")
  .append("rect")
  .attr("width", width)
  .attr("height", height);

const mapGroup = svg.append("g")
  .attr("clip-path", "url(#clip-right)");

svg.append("text")
  .attr("id", "year-text")
  .attr("x", 20)
  .attr("y", 40)
  .attr("font-size", "32px")
  .attr("fill", "#333")
  .text("Year: ---"); // initial placeholder


const countryLabel = svg.append("text")
  .attr("x", 20).attr("y", 80)
  .attr("font-size", "24px")
  .attr("fill", "#555");

let projection = createProjection(originalCenter, originalScale, originalTranslate, originalParallels);
let path = d3.geoPath().projection(projection);

// ========== BAR CHART SETUP ==========
const barSvg = d3.select("#bar-chart");
const barMargin = { top: 40, right: 20, bottom: 80, left: 50 };
const barWidth = +barSvg.attr("width") - barMargin.left - barMargin.right;
const barHeight = +barSvg.attr("height") - barMargin.top - barMargin.bottom;

const barGroup = barSvg.append("g")
  .attr("transform", `translate(${barMargin.left},${barMargin.top})`);

barSvg.append("text")
  .attr("x", barMargin.left).attr("y", 20)
  .attr("font-size", "16px")
  .attr("fill", "#333")
  .text("Top 5 Cities by Frequency");

let xBarScale = d3.scaleBand().range([0, barWidth]).padding(0.1);
let yBarScale = d3.scaleLinear().range([barHeight, 0]);

const xAxisGroup = barGroup.append("g")
  .attr("transform", `translate(0,${barHeight})`);
const yAxisGroup = barGroup.append("g");

// ========== FUNCTIONS ==========

function createProjection(center, scale, translate, parallels) {
  return d3.geoConicConformal()
    .center(center)
    .parallels(parallels)
    .scale(scale)
    .translate(translate);
}

function updateSlider(year) {
  const slider = document.getElementById("year-slider");
  if (slider) {
    slider.value = +year;
  }
}


function updateMap() {
  const year = years[currentIndex];
  d3.select("#year-text").text(`Year: ${year}`);

  // Update external year label above slider (NEW)
  const sliderYearText = document.getElementById("slider-year-text");
  if (sliderYearText) {
    sliderYearText.textContent = year;
  }

  // Update actual slider thumb position (already working)
  updateSlider(year);

  let citiesThisYear = cities.filter(d => d.Year === year);
  if (selectedCountry) {
    citiesThisYear = citiesThisYear.filter(d =>
      d3.geoContains(selectedCountry, [d.Longitude, d.Latitude])
    );
  }

  const topCities = [...citiesThisYear].sort((a, b) => b.Frequency - a.Frequency).slice(0, 5);

  // Clear previous map elements
  mapGroup.selectAll(".country,.city,.city-hit,.label,.label-line").remove();

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

  // Append invisible bigger circles as hit targets for easier selection
  const cityHits = mapGroup.selectAll(".city-hit")
    .data(citiesThisYear)
    .enter()
    .append("circle")
    .attr("class", "city-hit")
    .attr("cx", d => projection([d.Longitude, d.Latitude])[0])
    .attr("cy", d => projection([d.Longitude, d.Latitude])[1])
    .attr("r", d => radiusScale(d.Frequency || 1) * 3) // bigger radius for hit area
    .attr("fill", "transparent")
    .style("cursor", "pointer")
    .on("mouseover", function(event, d) {
  mapGroup.selectAll(".city")
    .filter(c => c.City === d.City)
    .transition()
    .duration(150)
    .attr("r", radiusScale(d.Frequency || 1) * 3)
    .attr("fill", "blue");  // change visible circle fill to blue
})
.on("mouseout", function(event, d) {
  mapGroup.selectAll(".city")
    .filter(c => c.City === d.City)
    .transition()
    .duration(150)
    .attr("r", radiusScale(d.Frequency || 1))
    .attr("fill", "red");   // revert visible circle fill to red
})

    .on("click", function(event, d) {
      stopAnimation();
      showCityTrend(d.City, d.Latitude, d.Longitude, years[currentIndex], event);
    });

  // Draw visible city circles on top
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
    .style("pointer-events", "none");  // disable pointer events here so events go to invisible hits

  // Prepare label data with offset so labels don't cover circles
  const labelData = topCities.map(d => {
    const [x, y] = projection([d.Longitude, d.Latitude]);
    return { x, y, x0: x, y0: y, ...d };
  });

  // Run force simulation for label collision avoidance
  const simulation = d3.forceSimulation(labelData)
    .force("collide", d3.forceCollide(15))
    .force("x", d3.forceX(d => d.x0).strength(0.2))
    .force("y", d3.forceY(d => d.y0).strength(0.2))
    .stop();

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
    .attr("fill", "#000")
    .style("pointer-events", "none");  // disable pointer events on labels

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
    .attr("stroke", "#999")
    .attr("stroke-width", 0.5)
    .style("pointer-events", "none");

  // Bar Chart Update
  xBarScale.domain(topCities.map(d => d.City));
  yBarScale.domain([0, d3.max(topCities, d => d.Frequency)]);

  xAxisGroup.call(d3.axisBottom(xBarScale))
    .selectAll("text")
    .attr("transform", "rotate(-45)")
    .style("text-anchor", "end");

  yAxisGroup.call(d3.axisLeft(yBarScale));

  const bars = barGroup.selectAll(".bar").data(topCities, d => d.City);

  bars.enter()
    .append("rect")
    .attr("class", "bar")
    .attr("x", d => xBarScale(d.City))
    .attr("width", xBarScale.bandwidth())
    .attr("y", barHeight)
    .attr("height", 0)
    .attr("fill", "#69b3a2")
    .transition()
    .duration(500)
    .attr("y", d => yBarScale(d.Frequency))
    .attr("height", d => barHeight - yBarScale(d.Frequency));

  bars.transition()
    .duration(500)
    .attr("x", d => xBarScale(d.City))
    .attr("y", d => yBarScale(d.Frequency))
    .attr("height", d => barHeight - yBarScale(d.Frequency))
    .attr("width", xBarScale.bandwidth());

  bars.exit().remove();

  const labels = barGroup.selectAll(".bar-label").data(topCities, d => d.City);

  labels.enter()
    .append("text")
    .attr("class", "bar-label")
    .attr("x", d => xBarScale(d.City) + xBarScale.bandwidth() / 2)
    .attr("y", d => yBarScale(d.Frequency) - 5)
    .text(d => d.Frequency)
    .attr("font-size", "10px")
    .attr("text-anchor", "middle");

  labels.transition()
    .duration(500)
    .attr("x", d => xBarScale(d.City) + xBarScale.bandwidth() / 2)
    .attr("y", d => yBarScale(d.Frequency) - 5)
    .text(d => d.Frequency);

  labels.exit().remove();
}



function startAnimation() {
  if (!intervalId) {
    intervalId = setInterval(() => {
      currentIndex = (currentIndex + 1) % years.length;
      console.log("Animation index:", currentIndex, years[currentIndex]); // Debug line
      updateMap();

    }, 1500);
  }
}

function stopAnimation() {
  clearInterval(intervalId);
  intervalId = null;
}

function resetView() {
  stopAnimation();
  currentIndex = 0;
  selectedCountry = null;
  countryLabel.text("");

  projection = createProjection(originalCenter, originalScale, originalTranslate, originalParallels);
  path = d3.geoPath().projection(projection);

  updateMap();
  startAnimation();
}

function zoomOut() {
  selectedCountry = null;
  countryLabel.text("");

  projection = createProjection(originalCenter, originalScale, originalTranslate, originalParallels);
  path = d3.geoPath().projection(projection);

  updateMap();
}

function zoomToCountry(country) {
  stopAnimation();
  selectedCountry = country;
  countryLabel.text(`Country: ${country.properties.NAME || "Unknown"}`);

  const [[x0, y0], [x1, y1]] = d3.geoBounds(country);
  const scale = Math.min(
    originalScale * (360 / (x1 - x0)) * 0.1,
    originalScale * (180 / (y1 - y0)) * 0.125
  );

  projection = createProjection(
    [(x0 + x1) / 2, (y0 + y1) / 2],
    scale,
    [width / 2, height / 2],
    originalParallels
  );
  path = d3.geoPath().projection(projection);
  updateMap();
  startAnimation();
}

function showCityTrend(cityName, lat, lon, currentYear, event) {
    // Clean up any existing popup and old body click listeners
  d3.select("#trend-popup").remove();
  d3.select("body").on("click.trend-popup", null);

  // Filter city data sorted by year ascending
  const cityData = cities
    .filter(d => d.City === cityName)
    .sort((a, b) => a.Year - b.Year);

  // Find index of currentYear, fallback to last year if not found
  let currentIndex = cityData.findIndex(d => d.Year === currentYear);
  if (currentIndex === -1) {
    console.warn(`Current year ${currentYear} not found for city ${cityName}, showing last 5 years instead.`);
    currentIndex = cityData.length - 1;
  }

  // Calculate start and end indices for last 5 years
  const endIndex = currentIndex;
  const startIndex = Math.max(0, endIndex - 4);

  // Slice the data for last 5 years only
  const recentData = cityData.slice(startIndex, endIndex + 1);

  console.log(`Showing years for city ${cityName}:`, recentData.map(d => d.Year));

  // Remove any existing popup first
  d3.select("#trend-popup").remove();

  // Create popup container positioned relative to event coordinates
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
    .style("pointer-events", "auto");

  popup.append("h4").text(`Last ${recentData.length} Years: ${cityName}`);

  // SVG setup
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

  // X scale based on recentData years only
  const x = d3.scaleBand()
    .domain(recentData.map(d => d.Year))
    .range([0, width])
    .padding(0.1);

  // Y scale based on recentData frequencies
  const y = d3.scaleLinear()
    .domain([0, d3.max(recentData, d => d.Frequency)]).nice()
    .range([height, 0]);

  // Axes
  g.append("g")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d"))); // format year as integer

  g.append("g").call(d3.axisLeft(y));

  // Bars
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

  // Close popup when clicking outside after a slight delay (to prevent immediate close)
  setTimeout(() => {
    d3.select("body").on("click.trend-popup", function (e) {
      const popupEl = document.getElementById("trend-popup");
      if (popupEl && !popupEl.contains(e.target)) {
        popupEl.remove();
        d3.select("body").on("click.trend-popup", null);
      }
    });
  }, 50);
}




// ========== DATA LOADING ==========
Promise.all([
  d3.json("/static/data/europe.topojson"),
  d3.json("/static/data/cities.json")
]).then(([mapData, cityData]) => {
  countries = topojson.feature(mapData, mapData.objects.europe).features;
  cities = cityData;
  years = [...new Set(cities.map(d => d.Year))].sort((a, b) => a - b);

  radiusScale = d3.scaleSqrt()
    .domain([1, d3.max(cities, d => d.Frequency || 1)])
    .range([1, 15]);

  const slider = document.getElementById("year-slider");
if (slider) {
  slider.min = d3.min(years);
  slider.max = d3.max(years);
  slider.step = 1;
  slider.value = years[0];

  // ✅ On slider input, find and set the matching year index
  slider.addEventListener("input", (event) => {
    stopAnimation(); // optional: pause animation when sliding
    const selectedYear = +event.target.value;
    const index = years.findIndex(y => y === selectedYear);

    if (index !== -1) {
      currentIndex = index;
      updateMap();
    } else {
      console.warn(`Slider selected year ${selectedYear} not found in data.`);
    }

  });
}
  const controls = d3.select("#controls");
  controls.append("button").text("Start").on("click", startAnimation);
  controls.append("button").text("Stop").on("click", stopAnimation);
  controls.append("button").text("Reset").on("click", resetView);
  controls.append("button").text("Zoom Out").on("click", zoomOut);
  controls.append("button").text("Previous").on("click", () => {
    stopAnimation();
    currentIndex = Math.max(0, currentIndex - 1);
    updateMap();
  });
  controls.append("button").text("Next").on("click", () => {
    stopAnimation();
    currentIndex = Math.min(years.length - 1, currentIndex + 1);
    updateMap();
  });

  updateMap();
  startAnimation();
});
