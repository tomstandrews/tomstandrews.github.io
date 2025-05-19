const width = 800;
const height = 600;

const svg = d3.select("#map")
  .attr("width", width)
  .attr("height", height);

svg.append("clipPath")
  .attr("id", "clip-right")
  .append("rect")
  .attr("x", 0)
  .attr("y", 0)
  .attr("width", width)
  .attr("height", height);

const mapGroup = svg.append("g")
  .attr("clip-path", "url(#clip-right)");

const yearText = svg.append("text")
  .attr("x", 20)
  .attr("y", 40)
  .attr("font-size", "32px")
  .attr("fill", "#333");

const countryLabel = svg.append("text")
  .attr("x", 20)
  .attr("y", 80)
  .attr("font-size", "24px")
  .attr("fill", "#555");

const originalCenter = [5, 50];
const originalParallels = [43, 62];
const originalScale = 1500;
const originalTranslate = [width / 2, height / 2 - 50];

let projection = d3.geoConicConformal()
  .center(originalCenter)
  .parallels(originalParallels)
  .scale(originalScale)
  .translate(originalTranslate);

let path = d3.geoPath().projection(projection);

let countries = [];
let cities = [];
let years = [];
let radiusScale;

let currentIndex = 0;
let intervalId = null;
let selectedCountry = null;

const barSvg = d3.select("#bar-chart");
const barMargin = { top: 40, right: 20, bottom: 80, left: 50 };
const barWidth = +barSvg.attr("width") - barMargin.left - barMargin.right;
const barHeight = +barSvg.attr("height") - barMargin.top - barMargin.bottom;

const barGroup = barSvg.append("g")
  .attr("transform", `translate(${barMargin.left},${barMargin.top})`);

barSvg.append("text")
  .attr("x", barMargin.left)
  .attr("y", 20)
  .attr("font-size", "16px")
  .attr("fill", "#333")
  .text("Top 5 Cities by Frequency");

let xBarScale = d3.scaleBand().range([0, barWidth]).padding(0.1);
let yBarScale = d3.scaleLinear().range([barHeight, 0]);

const xAxisGroup = barGroup.append("g")
  .attr("transform", `translate(0,${barHeight})`);
const yAxisGroup = barGroup.append("g");

function createProjection(center, scale, translate, parallels) {
  return d3.geoConicConformal()
    .center(center)
    .parallels(parallels)
    .scale(scale)
    .translate(translate);
}

function updateMap() {
  const year = years[currentIndex];
  yearText.text(year);

  let citiesThisYear = cities.filter(d => d.Year === year);

  if (selectedCountry) {
    citiesThisYear = citiesThisYear.filter(d =>
      d3.geoContains(selectedCountry, [d.Longitude, d.Latitude])
    );
  }

  const top10 = [...citiesThisYear]
    .sort((a, b) => b.Frequency - a.Frequency)
    .slice(0, 5);

  mapGroup.selectAll(".country").remove();
  mapGroup.selectAll(".city").remove();
  mapGroup.selectAll(".label").remove();
  mapGroup.selectAll(".label-line").remove();

  mapGroup.selectAll(".country")
    .data(countries)
    .enter()
    .append("path")
    .attr("class", "country")
    .attr("d", path)
    .attr("fill", "#ccc")
    .attr("stroke", "#333")
    .attr("stroke-width", 0.5)
    .classed("selected", d => d === selectedCountry)
    .style("cursor", "pointer")
    .on("click", function(event, d) {
      zoomToCountry(d);

    });

  mapGroup.selectAll(".city")
    .data(citiesThisYear)
    .enter()
    .append("circle")
    .attr("class", "city")
    .attr("cx", d => projection([d.Longitude, d.Latitude])[0])
    .attr("cy", d => projection([d.Longitude, d.Latitude])[1])
    .attr("r", 0)
    .transition()
    .duration(500)
    .attr("r", d => radiusScale(d.Frequency || 1))
    .attr("fill", "red")
    .attr("opacity", 0.7);

  // --------- Label overlap fix with force simulation ---------
  const labelData = top10.map(d => {
    const [x, y] = projection([d.Longitude, d.Latitude]);
    return {
      x,
      y,
      x0: x,
      y0: y,
      City: d.City,
      Longitude: d.Longitude,
      Latitude: d.Latitude,
      Frequency: d.Frequency
    };
  });

  const simulation = d3.forceSimulation(labelData)
    .force("collide", d3.forceCollide(15))
    .force("x", d3.forceX(d => d.x0).strength(0.2))
    .force("y", d3.forceY(d => d.y0).strength(0.2))
    .stop();

  for (let i = 0; i < 300; ++i) simulation.tick();

  mapGroup.selectAll(".label")
    .data(labelData)
    .enter()
    .append("text")
    .attr("class", "label")
    .attr("x", d => d.x)
    .attr("y", d => d.y)
    .text(d => d.City)
    .attr("font-size", "12px")
    .attr("fill", "#000")
    .attr("text-anchor", "start");

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
    .attr("stroke-width", 0.5);

  // Bar chart update
  xBarScale.domain(top10.map(d => d.City));
  yBarScale.domain([0, d3.max(top10, d => d.Frequency)]);

  xAxisGroup.call(d3.axisBottom(xBarScale))
    .selectAll("text")
    .attr("transform", "rotate(-45)")
    .style("text-anchor", "end");

  yAxisGroup.call(d3.axisLeft(yBarScale));

  const bars = barGroup.selectAll(".bar").data(top10, d => d.City);

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

  const labels = barGroup.selectAll(".bar-label").data(top10, d => d.City);

  labels.enter()
    .append("text")
    .attr("class", "bar-label")
    .attr("x", d => xBarScale(d.City) + xBarScale.bandwidth() / 2)
    .attr("y", d => yBarScale(d.Frequency) - 5)
    .attr("text-anchor", "middle")
    .attr("font-size", "10px")
    .text(d => d.Frequency);

  labels.transition()
    .duration(500)
    .attr("x", d => xBarScale(d.City) + xBarScale.bandwidth() / 2)
    .attr("y", d => yBarScale(d.Frequency) - 5)
    .text(d => d.Frequency);

  labels.exit().remove();

  currentIndex = (currentIndex + 1) % years.length;
}

function startAnimation() {
  if (!intervalId) {
    intervalId = setInterval(updateMap, 1500);
  }
}

function stopAnimation() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
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
  countryLabel.text("Country: " + (country.properties.NAME || "Unknown"));

  const [[x0, y0], [x1, y1]] = d3.geoBounds(country);
  const centerLon = (x0 + x1) / 2;
  const centerLat = (y0 + y1) / 2;
  const countryWidth = x1 - x0;
  const countryHeight = y1 - y0;

  const zoomFactorWidth = 0.1;
  const zoomFactorHeight = 0.125;

  const scale = Math.min(
    originalScale * (360 / countryWidth) * zoomFactorWidth,
    originalScale * (180 / countryHeight) * zoomFactorHeight
  );

  projection = createProjection(
    [centerLon, centerLat],
    scale,
    [width / 2, height / 2],
    originalParallels
  );

  path = d3.geoPath().projection(projection);

  updateMap();
  startAnimation();
}

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

  updateMap();
  startAnimation();

  const controls = d3.select("body").append("div").style("margin-top", "10px");

  controls.append("button")
    .text("Start")
    .style("margin-right", "10px")
    .on("click", startAnimation);

  controls.append("button")
    .text("Stop")
    .style("margin-right", "10px")
    .on("click", stopAnimation);

  controls.append("button")
    .text("Reset")
    .on("click", resetView);

  controls.append("button")
    .text("Zoom Out")
    .style("margin-left", "10px")
    .on("click", zoomOut);

}).catch(error => {
  console.error("Data load error:", error);
});
