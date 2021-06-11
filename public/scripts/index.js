(async () => {
  console.log('Hello')
  const socket = io();

  const cities = ['warszawa', 'lodz', 'wroclaw', 'szczecin', 'rzeszow', 'krakow', 'gdansk', 'suwalki'];
  const services = ['openweather', 'weatherbit', 'weatherstack'];
  const ranges = ['1', '3', '7']

  const cityLut = {
    'warszawa': 'Warszawa',
    'lodz': 'Łódź',
    'wroclaw': 'Wrocław',
    'szczecin': 'Szczecin',
    'rzeszow': 'Rzeszów',
    'krakow': 'Kraków',
    'gdansk': 'Gdańsk',
    'suwalki': 'Suwałki'
  }

  const fieldLut = {
    'temp': 'Temperature [C]',
    'pressure': 'Pressure [hPa]',
    'humidity': 'Humidity [%]',
    'preci': 'Precipitation [mm]',
    'wind': 'Wind [m/s]',
    'wind_dir': 'Wind direction [deg]'
  };

  function stdDev(array) {
    const n = array.length
    const mean = array.reduce((a, b) => a + b) / n
    return Math.sqrt(array.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n)
  }

  socket.on('connected', () => {
    console.log('Connected!')
  });

  socket.on('range data', data => {
    console.log(data)
    const $results = $('.results').empty()
    $('<h1>').text(`Service: ${data.service}`).appendTo($results);
    const $table = $('<table>').appendTo($results);
    const $tr1 = $('<tr>').append($('<th>').text(data.date)).appendTo($table);
    for (const city of Object.keys(data.cities)) {
      $tr1.append($('<th>').text(cityLut[city]))
    }
    $tr1.append($('<th>').text('Poland'));
    const fields = ['temp', 'pressure', 'humidity', 'preci', 'wind', 'wind_dir']
    for (const field of fields) {
      const $tr = $('<tr>').appendTo($table);
      $tr.append($('<td>').text(fieldLut[field]));
      let sum = 0;
      let count = 0;
      for (const city of Object.keys(data.cities)) {
        let value = data.cities[city][field];
        if (value.includes('.')) {
          value = Number(value).toFixed(2)
        }
        if (!isNaN(value)) {
          count++;
          sum += Number(value);
        }
        $tr.append($('<td>').text(value));
      }
      $tr.append($('<td>').text(((sum / count) || 0).toFixed(2)))
    }
  });

  socket.on('city data', data => {
    console.log(data);
    const $results = $('.results').empty()
    $('<h1>').text(`City: ${cityLut[data.city]}`).appendTo($results);
    const $table = $('<table>').appendTo($results);
    const $tr1 = $('<tr>').append($('<th>').text(cityLut[data.city])).appendTo($table);
    for (const service of Object.keys(data.services)) {
      $tr1.append($('<th>').text(service))
    }
    $tr1.append($('<th>').text('Standard deviation'));
    const fields = ['temp', 'pressure', 'humidity', 'preci', 'wind', 'wind_dir']
    for (const field of fields) {
      const $tr = $('<tr>').appendTo($table);
      $tr.append($('<td>').text(fieldLut[field]));
      for (const service of Object.keys(data.services)) {
        let value = data.services[service][field];
        if (typeof value === 'string' && value.includes('.')) {
          value = Number(value).toFixed(2)
        }
        $tr.append($('<td>', {class: 'val'}).text(value));
      }
      const values = $tr.find('.val').toArray().map(e => +e.innerText).filter(x => !isNaN(x))
      $tr.append($('<td>').text(stdDev(values).toFixed(2)))
    }
  })

  fetch('/token').then(response => response.json()).then(json => {
    if (!json.success) {
      return alert(json.msg);
    }
    socket.emit('auth', json.token);
  }).catch(err => console.error(err));

  $('#load-data').on('click', e => {
    const service = $('#service-select option:selected').val();
    const range = $('#time-select option:selected').val();
    if (service === 'none') {
      return alert('Please select a service');
    }
    if (range === 'none') {
      return alert('Please select a time range')
    }
    if (!ranges.includes(range) || !services.includes(service)) return;
    socket.emit('get range data', {service, range});
  });

  $('#load-city').on('click', e => {
    const city = $('#city-select option:selected').val();
    if (city === 'none') {
      return alert('Please select a city')
    }
    if (!cities.includes(city)) return;
    socket.emit('get city data', city);
  });

})();