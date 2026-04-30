export interface CarBrand {
  name: string;
  models: string[];
}

export const CAR_BRANDS: CarBrand[] = [
  {
    name: 'Acura',
    models: ['ILX', 'TLX', 'RLX', 'NSX', 'RDX', 'MDX', 'Integra'],
  },
  {
    name: 'Alfa Romeo',
    models: ['Giulia', 'Stelvio', 'Tonale', '4C', 'Giulietta', 'MiTo', '8C Competizione'],
  },
  {
    name: 'Aston Martin',
    models: ['Vantage', 'DB11', 'DB12', 'DBS', 'DBX', 'Valkyrie', 'Vanquish'],
  },
  {
    name: 'Audi',
    models: [
      'A1 25 TFSI', 'A1 30 TFSI', 'A1 35 TFSI', 'A1 40 TFSI',
      'A3 30 TFSI', 'A3 35 TFSI', 'A3 40 TFSI', 'A3 30 TDI', 'A3 35 TDI', 'S3', 'RS3',
      'A4 35 TFSI', 'A4 40 TFSI', 'A4 45 TFSI', 'A4 35 TDI', 'A4 40 TDI', 'A4 45 TDI', 'S4', 'RS4',
      'A5 35 TFSI', 'A5 40 TFSI', 'A5 45 TFSI', 'A5 35 TDI', 'A5 40 TDI', 'A5 45 TDI', 'S5', 'RS5',
      'A6 40 TFSI', 'A6 45 TFSI', 'A6 55 TFSI', 'A6 40 TDI', 'A6 45 TDI', 'A6 50 TDI', 'S6', 'RS6',
      'A7 45 TFSI', 'A7 55 TFSI', 'A7 45 TDI', 'A7 50 TDI', 'S7', 'RS7',
      'A8 55 TFSI', 'A8 60 TFSI', 'A8 50 TDI', 'A8 60 TDI', 'S8',
      'Q2 30 TFSI', 'Q2 35 TFSI', 'Q2 30 TDI', 'Q2 35 TDI', 'SQ2',
      'Q3 35 TFSI', 'Q3 40 TFSI', 'Q3 45 TFSI', 'Q3 35 TDI', 'Q3 40 TDI', 'RS Q3',
      'Q4 e-tron 35', 'Q4 e-tron 40', 'Q4 e-tron 45', 'Q4 e-tron 50',
      'Q5 40 TFSI', 'Q5 45 TFSI', 'Q5 40 TDI', 'Q5 45 TDI', 'Q5 50 TDI', 'SQ5', 'RS Q5',
      'Q7 45 TFSI', 'Q7 55 TFSI', 'Q7 45 TDI', 'Q7 50 TDI', 'SQ7',
      'Q8 50 TFSI', 'Q8 55 TFSI', 'Q8 50 TDI', 'SQ8', 'RS Q8',
      'TT 40 TFSI', 'TT 45 TFSI', 'TTS', 'TT RS',
      'R8 V10', 'R8 V10 Performance', 'R8 GT',
      'e-tron 50', 'e-tron 55', 'e-tron S',
      'e-tron GT', 'RS e-tron GT'
    ],
  },
  {
    name: 'Bentley',
    models: ['Continental GT', 'Continental GTC', 'Flying Spur', 'Bentayga', 'Mulsanne', 'Bacalar'],
  },
  {
    name: 'BMW',
    models: [
      '116i', '118i', '120i', '125i', 'M135i', '116d', '118d', '120d',
      '218i', '220i', '223i', '228i', 'M235i', '218d', '220d', '223d',
      '318i', '320i', '330i', '340i', 'M340i', '318d', '320d', '325d', '330d', '335d',
      '420i', '430i', '440i', 'M440i', '420d', '430d', '435d',
      '520i', '530i', '540i', 'M550i', '520d', '525d', '530d', '535d', '540d',
      '630i', '640i', '650i', '630d', '640d',
      '730i', '740i', '750i', 'M760i', '730d', '740d', '750d',
      '840i', '850i', 'M850i', '840d',
      'X1 sDrive18i', 'X1 sDrive20i', 'X1 xDrive25i', 'X1 sDrive18d', 'X1 xDrive20d', 'X1 xDrive25d',
      'X2 sDrive18i', 'X2 sDrive20i', 'X2 M35i', 'X2 sDrive18d', 'X2 xDrive20d',
      'X3 sDrive20i', 'X3 xDrive30i', 'X3 M40i', 'X3 xDrive20d', 'X3 xDrive30d', 'X3 M40d', 'X3 M',
      'X4 xDrive20i', 'X4 xDrive30i', 'X4 M40i', 'X4 xDrive20d', 'X4 xDrive30d', 'X4 M40d', 'X4 M',
      'X5 xDrive40i', 'X5 xDrive50i', 'X5 M50i', 'X5 xDrive25d', 'X5 xDrive30d', 'X5 xDrive40d', 'X5 M50d', 'X5 M',
      'X6 xDrive40i', 'X6 M50i', 'X6 xDrive30d', 'X6 xDrive40d', 'X6 M50d', 'X6 M',
      'X7 xDrive40i', 'X7 M60i', 'X7 xDrive30d', 'X7 xDrive40d', 'X7 M50d',
      'XM', 'XM Label Red',
      'Z4 sDrive20i', 'Z4 sDrive30i', 'Z4 M40i',
      '335is E93',
      'M2', 'M2 Competition', 'M3', 'M3 Competition', 'M4', 'M4 Competition', 'M5', 'M5 Competition', 'M8', 'M8 Competition',
      'i3', 'i4 eDrive35', 'i4 eDrive40', 'i4 M50', 'i5 eDrive40', 'i5 M60', 'i7 eDrive50', 'i7 xDrive60', 'i7 M70',
      'iX xDrive40', 'iX xDrive50', 'iX M60', 'iX3'
    ],
  },
  {
    name: 'Bugatti',
    models: ['Chiron', 'Chiron Sport', 'Chiron Pur Sport', 'Divo', 'Centodieci', 'Bolide', 'Mistral'],
  },
  {
    name: 'Buick',
    models: ['Encore', 'Encore GX', 'Envision', 'Enclave', 'LaCrosse', 'Regal'],
  },
  {
    name: 'Cadillac',
    models: ['CT4', 'CT5', 'CT5-V', 'XT4', 'XT5', 'XT6', 'Escalade', 'Lyriq', 'Celestiq', 'Blackwing'],
  },
  {
    name: 'Chevrolet',
    models: ['Spark', 'Sonic', 'Cruze', 'Malibu', 'Impala', 'Camaro', 'Corvette', 'Corvette Z06', 'Corvette E-Ray', 'Bolt EV', 'Bolt EUV', 'Trax', 'Equinox', 'Blazer', 'Traverse', 'Tahoe', 'Suburban', 'Colorado', 'Silverado', 'Silverado HD'],
  },
  {
    name: 'Chrysler',
    models: ['300', '300C', 'Pacifica', 'Voyager'],
  },
  {
    name: 'Citroën',
    models: ['C1', 'C3', 'C3 Aircross', 'C4', 'C4 X', 'C5 Aircross', 'C5 X', 'Berlingo', 'SpaceTourer', 'ë-C4', 'Xsara', 'Xsara Picasso', 'Xsara VTS'],
  },
  {
    name: 'Cupra',
    models: ['Formentor', 'Leon', 'Born', 'Ateca', 'Tavascan'],
  },
  {
    name: 'Dacia',
    models: ['Sandero', 'Sandero Stepway', 'Duster', 'Jogger', 'Spring', 'Logan'],
  },
  {
    name: 'Dodge',
    models: ['Challenger', 'Challenger SRT', 'Charger', 'Charger SRT', 'Durango', 'Durango SRT', 'Hornet'],
  },
  {
    name: 'Ferrari',
    models: ['296 GTB', '296 GTS', 'SF90 Stradale', 'SF90 Spider', 'F8 Tributo', 'F8 Spider', 'Roma', 'Roma Spider', 'Portofino M', '812 Superfast', '812 GTS', '812 Competizione', 'Purosangue', 'Daytona SP3', 'Monza SP1', 'Monza SP2', 'LaFerrari'],
  },
  {
    name: 'Fiat',
    models: ['500', '500e', '500X', '500L', 'Bravo', 'Panda', 'Tipo', 'Punto', 'Doblo', '124 Spider', 'Abarth 595', 'Abarth 695'],
  },
  {
    name: 'Ford',
    models: ['Fiesta', 'Fiesta ST', 'Focus', 'Focus ST', 'Focus RS', 'Mustang', 'Mustang GT', 'Mustang Mach-E', 'Mustang Mach 1', 'GT', 'F-150', 'F-150 Lightning', 'F-150 Raptor', 'F-250', 'F-350', 'Bronco', 'Bronco Sport', 'Explorer', 'Expedition', 'Ranger', 'Ranger Raptor', 'Maverick', 'Edge', 'Escape', 'EcoSport', 'Puma', 'Kuga'],
  },
  {
    name: 'Genesis',
    models: ['G70', 'G80', 'G90', 'GV60', 'GV70', 'GV80', 'Electrified G80', 'Electrified GV70'],
  },
  {
    name: 'GMC',
    models: ['Canyon', 'Sierra 1500', 'Sierra 2500HD', 'Sierra 3500HD', 'Terrain', 'Acadia', 'Yukon', 'Yukon XL', 'Hummer EV'],
  },
  {
    name: 'Honda',
    models: ['Fit', 'Civic', 'Civic Si', 'Civic Type R', 'Accord', 'Insight', 'Clarity', 'HR-V', 'CR-V', 'Passport', 'Pilot', 'Ridgeline', 'Odyssey', 'e:NY1', 'ZR-V', 'NSX'],
  },
  {
    name: 'Hyundai',
    models: ['i10', 'i20', 'i20 N', 'i30', 'i30 N', 'Elantra', 'Elantra N', 'Sonata', 'Veloster N', 'Kona', 'Kona N', 'Tucson', 'Santa Fe', 'Palisade', 'Ioniq 5', 'Ioniq 5 N', 'Ioniq 6', 'Nexo', 'Staria'],
  },
  {
    name: 'Infiniti',
    models: ['Q50', 'Q60', 'QX50', 'QX55', 'QX60', 'QX80'],
  },
  {
    name: 'Jaguar',
    models: ['XE', 'XF', 'XJ', 'F-Type', 'F-Type R', 'E-Pace', 'F-Pace', 'F-Pace SVR', 'I-Pace'],
  },
  {
    name: 'Jeep',
    models: ['Renegade', 'Compass', 'Cherokee', 'Grand Cherokee', 'Grand Cherokee L', 'Grand Cherokee 4xe', 'Wrangler', 'Wrangler 4xe', 'Wrangler Rubicon', 'Gladiator', 'Wagoneer', 'Grand Wagoneer', 'Avenger'],
  },
  {
    name: 'Kia',
    models: ['Picanto', 'Rio', 'Forte', 'K5', 'Stinger', 'Stinger GT', 'Soul', 'Seltos', 'Sportage', 'Sorento', 'Telluride', 'Carnival', 'Niro', 'Niro EV', 'EV6', 'EV6 GT', 'EV9'],
  },
  {
    name: 'Koenigsegg',
    models: ['Jesko', 'Jesko Absolut', 'Gemera', 'Regera', 'Agera RS', 'CC850'],
  },
  {
    name: 'Lamborghini',
    models: ['Huracán', 'Huracán Evo', 'Huracán STO', 'Huracán Tecnica', 'Huracán Sterrato', 'Aventador', 'Aventador SVJ', 'Urus', 'Urus Performante', 'Revuelto', 'Sián'],
  },
  {
    name: 'Land Rover',
    models: ['Defender 90', 'Defender 110', 'Defender 130', 'Discovery', 'Discovery Sport', 'Range Rover', 'Range Rover Sport', 'Range Rover Sport SVR', 'Range Rover Velar', 'Range Rover Evoque'],
  },
  {
    name: 'Lexus',
    models: ['IS', 'IS 500', 'ES', 'GS', 'LS', 'RC', 'RC F', 'LC', 'LC 500', 'UX', 'NX', 'RX', 'GX', 'LX', 'RZ', 'LFA'],
  },
  {
    name: 'Lincoln',
    models: ['Corsair', 'Nautilus', 'Aviator', 'Navigator'],
  },
  {
    name: 'Lotus',
    models: ['Elise', 'Exige', 'Evora', 'Emira', 'Evija', 'Eletre'],
  },
  {
    name: 'Maserati',
    models: ['Ghibli', 'Ghibli Trofeo', 'Quattroporte', 'Quattroporte Trofeo', 'Levante', 'Levante Trofeo', 'MC20', 'MC20 Cielo', 'Grecale', 'GranTurismo', 'GranCabrio'],
  },
  {
    name: 'Mazda',
    models: ['Mazda2', 'Mazda3', 'Mazda3 Turbo', 'Mazda6', 'MX-5 Miata', 'MX-5 RF', 'MX-30', 'CX-3', 'CX-30', 'CX-5', 'CX-50', 'CX-60', 'CX-70', 'CX-8', 'CX-9', 'CX-90'],
  },
  {
    name: 'McLaren',
    models: ['540C', '570S', '570GT', '600LT', '620R', '650S', '675LT', '720S', '765LT', 'Artura', 'GT', 'P1', 'Senna', 'Speedtail', 'Elva', 'Solus GT'],
  },
  {
    name: 'Mercedes-AMG',
    models: ['A 35', 'A 45 S', 'CLA 35', 'CLA 45 S', 'C 43', 'C 63', 'E 53', 'E 63 S', 'S 63', 'GT', 'GT R', 'GT Black Series', 'GT 63 S', 'SL 43', 'SL 55', 'SL 63', 'G 63', 'GLE 53', 'GLE 63 S', 'GLS 63', 'One'],
  },
  {
    name: 'Mercedes-Benz',
    models: [
      'A 160', 'A 180', 'A 200', 'A 220', 'A 250', 'A 180d', 'A 200d', 'A 220d',
      'B 160', 'B 180', 'B 200', 'B 220', 'B 180d', 'B 200d', 'B 220d',
      'C 160', 'C 180', 'C 200', 'C 220', 'C 300', 'C 180d', 'C 200d', 'C 220d', 'C 300d',
      'E 200', 'E 220', 'E 300', 'E 350', 'E 400', 'E 450', 'E 200d', 'E 220d', 'E 300d', 'E 350d', 'E 400d',
      'S 350', 'S 400', 'S 450', 'S 500', 'S 580', 'S 350d', 'S 400d', 'S 450d',
      'CLA 180', 'CLA 200', 'CLA 220', 'CLA 250', 'CLA 180d', 'CLA 200d', 'CLA 220d',
      'CLS 350', 'CLS 400', 'CLS 450', 'CLS 300d', 'CLS 350d', 'CLS 400d',
      'GLA 180', 'GLA 200', 'GLA 220', 'GLA 250', 'GLA 180d', 'GLA 200d', 'GLA 220d',
      'GLB 180', 'GLB 200', 'GLB 220', 'GLB 250', 'GLB 180d', 'GLB 200d', 'GLB 220d',
      'GLC 200', 'GLC 220', 'GLC 300', 'GLC 200d', 'GLC 220d', 'GLC 300d', 'GLC Coupe 200', 'GLC Coupe 300', 'GLC Coupe 220d', 'GLC Coupe 300d',
      'GLE 300', 'GLE 350', 'GLE 400', 'GLE 450', 'GLE 580', 'GLE 300d', 'GLE 350d', 'GLE 400d', 'GLE Coupe 350', 'GLE Coupe 400d',
      'GLS 400', 'GLS 450', 'GLS 580', 'GLS 350d', 'GLS 400d',
      'G 400d', 'G 500', 'G 580',
      'SL 43', 'SL 55', 'SL 63',
      'V 220d', 'V 250d', 'V 300d',
      'EQA 250', 'EQA 300', 'EQA 350',
      'EQB 250', 'EQB 300', 'EQB 350',
      'EQC 400',
      'EQE 300', 'EQE 350', 'EQE 500', 'EQE SUV 350', 'EQE SUV 500',
      'EQS 450', 'EQS 500', 'EQS 580', 'EQS SUV 450', 'EQS SUV 580',
      'Maybach S 580', 'Maybach S 680', 'Maybach GLS 600'
    ],
  },
  {
    name: 'Mini',
    models: ['Hatch', 'Cooper', 'Cooper S', 'John Cooper Works', 'Convertible', 'Clubman', 'Countryman', 'Electric', 'Paceman', 'Coupe'],
  },
  {
    name: 'Mitsubishi',
    models: ['Mirage', 'Lancer', 'Lancer Evolution', 'Eclipse Cross', 'Outlander', 'Outlander PHEV', 'Pajero', 'L200', 'ASX'],
  },
  {
    name: 'Nissan',
    models: ['Micra', 'Versa', 'Sentra', 'Altima', 'Maxima', 'Leaf', 'Ariya', 'GT-R', 'GT-R Nismo', 'Z', '370Z', '350Z', 'Kicks', 'Rogue', 'Rogue Sport', 'Murano', 'Pathfinder', 'Armada', 'Frontier', 'Titan', 'Qashqai', 'X-Trail', 'Juke'],
  },
  {
    name: 'Opel',
    models: ['Corsa', 'Corsa-e', 'Astra', 'Insignia', 'Mokka', 'Mokka-e', 'Crossland', 'Grandland', 'Combo', 'Zafira', 'Vivaro'],
  },
  {
    name: 'Pagani',
    models: ['Huayra', 'Huayra BC', 'Huayra Roadster BC', 'Huayra R', 'Utopia', 'Zonda'],
  },
  {
    name: 'Peugeot',
    models: ['108', '208', '208 GTi', 'e-208', '308', '308 GTi', '408', '508', '508 PSE', '2008', 'e-2008', '3008', '5008', 'Rifter', 'Traveller'],
  },
  {
    name: 'Polestar',
    models: ['Polestar 1', 'Polestar 2', 'Polestar 3', 'Polestar 4', 'Polestar 5'],
  },
  {
    name: 'Porsche',
    models: ['718 Cayman', '718 Cayman GT4', '718 Cayman GT4 RS', '718 Boxster', '718 Boxster Spyder', '911', '911 Carrera', '911 Carrera S', '911 Carrera 4S', '911 Turbo', '911 Turbo S', '911 GT3', '911 GT3 RS', '911 GT2 RS', '911 Targa', '911 Dakar', 'Panamera', 'Panamera Turbo', 'Panamera Turbo S', 'Cayenne', 'Cayenne Coupe', 'Cayenne Turbo GT', 'Macan', 'Macan GTS', 'Taycan', 'Taycan Turbo S', 'Taycan Cross Turismo', '918 Spyder'],
  },
  {
    name: 'Ram',
    models: ['1500', '1500 TRX', '2500', '3500', 'ProMaster'],
  },
  {
    name: 'Renault',
    models: ['Clio', 'Clio RS', 'Megane', 'Megane RS', 'Megane E-Tech', 'Talisman', 'Captur', 'Kadjar', 'Koleos', 'Arkana', 'Scenic', 'Espace', 'Twingo', 'Zoe', 'Alpine A110'],
  },
  {
    name: 'Rivian',
    models: ['R1T', 'R1S', 'R2', 'R3'],
  },
  {
    name: 'Rolls-Royce',
    models: ['Ghost', 'Ghost Extended', 'Ghost Black Badge', 'Wraith', 'Wraith Black Badge', 'Dawn', 'Dawn Black Badge', 'Phantom', 'Phantom Extended', 'Cullinan', 'Cullinan Black Badge', 'Spectre'],
  },
  {
    name: 'Seat',
    models: ['Ibiza', 'Leon', 'Leon FR', 'Arona', 'Ateca', 'Tarraco', 'Mii Electric'],
  },
  {
    name: 'Skoda',
    models: ['Fabia', 'Scala', 'Octavia', 'Octavia RS', 'Superb', 'Kamiq', 'Karoq', 'Kodiaq', 'Kodiaq RS', 'Enyaq', 'Enyaq Coupe'],
  },
  {
    name: 'Smart',
    models: ['ForTwo', 'ForFour', 'EQ ForTwo', 'EQ ForFour', '#1', '#3'],
  },
  {
    name: 'Subaru',
    models: ['Impreza', 'Impreza WRX', 'WRX', 'WRX STI', 'Legacy', 'BRZ', 'Outback', 'Forester', 'Crosstrek', 'Ascent', 'Solterra', 'Levorg'],
  },
  {
    name: 'Suzuki',
    models: ['Swift', 'Swift Sport', 'Baleno', 'Ignis', 'Vitara', 'S-Cross', 'Jimny', 'Across'],
  },
  {
    name: 'Tesla',
    models: ['Model S', 'Model S Plaid', 'Model 3', 'Model 3 Performance', 'Model X', 'Model X Plaid', 'Model Y', 'Model Y Performance', 'Cybertruck', 'Cybertruck Cyberbeast', 'Roadster', 'Semi'],
  },
  {
    name: 'Toyota',
    models: ['Yaris', 'Yaris GR', 'Corolla', 'Corolla GR', 'Camry', 'Avensis', 'Avalon', 'Prius', 'Mirai', 'Supra', 'GR86', 'C-HR', 'RAV4', 'RAV4 Prime', 'Venza', 'Highlander', 'Sequoia', '4Runner', 'Land Cruiser', 'bZ4X', 'Tacoma', 'Tundra', 'Sienna'],
  },
  {
    name: 'Vauxhall',
    models: ['Corsa', 'Corsa-e', 'Astra', 'Insignia', 'Mokka', 'Mokka-e', 'Crossland', 'Grandland'],
  },
  {
    name: 'Volkswagen',
    models: [
      'Polo 1.0 TSI', 'Polo 1.0 TGI', 'Polo 1.5 TSI', 'Polo GTI',
      'Golf 1.0 TSI', 'Golf 1.5 TSI', 'Golf 2.0 TSI', 'Golf 1.5 eTSI', 'Golf 2.0 TDI', 'Golf GTE', 'Golf GTI', 'Golf GTI Clubsport', 'Golf R',
      'Jetta 1.4 TSI', 'Jetta 1.5 TSI', 'Jetta 2.0 TSI', 'Jetta GLI',
      'Passat 1.5 TSI', 'Passat 2.0 TSI', 'Passat 1.5 eTSI', 'Passat 2.0 TDI', 'Passat GTE',
      'Arteon 1.5 TSI', 'Arteon 2.0 TSI', 'Arteon 2.0 TDI', 'Arteon R', 'Arteon Shooting Brake',
      'T-Cross 1.0 TSI', 'T-Cross 1.5 TSI',
      'T-Roc 1.0 TSI', 'T-Roc 1.5 TSI', 'T-Roc 2.0 TSI', 'T-Roc 2.0 TDI', 'T-Roc R',
      'Tiguan 1.5 TSI', 'Tiguan 2.0 TSI', 'Tiguan 2.0 TDI', 'Tiguan eHybrid', 'Tiguan R',
      'Touareg 3.0 TSI', 'Touareg 3.0 TDI', 'Touareg R', 'Touareg V8 TDI',
      'Atlas 2.0 TSI', 'Atlas 3.6 V6', 'Atlas Cross Sport 2.0 TSI', 'Atlas Cross Sport 3.6 V6',
      'Taos 1.5 TSI',
      'ID.3 Pure', 'ID.3 Pro', 'ID.3 Pro S', 'ID.3 GTX',
      'ID.4 Pure', 'ID.4 Pro', 'ID.4 Pro S', 'ID.4 GTX',
      'ID.5 Pro', 'ID.5 Pro S', 'ID.5 GTX',
      'ID.7 Pro', 'ID.7 Pro S', 'ID.7 GTX',
      'ID. Buzz Pro', 'ID. Buzz Pro S', 'ID. Buzz GTX',
      'Scirocco 1.4 TSI', 'Scirocco 2.0 TSI', 'Scirocco R',
      'Beetle 1.2 TSI', 'Beetle 1.4 TSI', 'Beetle 2.0 TSI',
      'Sharan 1.8T', 'Sharan 1.9 TDI', 'Sharan 2.0 TDI', 'Sharan 2.8 VR6'
    ],
  },
  {
    name: 'Volvo',
    models: ['S60', 'S60 Recharge', 'S90', 'S90 Recharge', 'V60', 'V60 Recharge', 'V60 Cross Country', 'V90', 'V90 Recharge', 'V90 Cross Country', 'XC40', 'XC40 Recharge', 'C40 Recharge', 'XC60', 'XC60 Recharge', 'XC90', 'XC90 Recharge', 'EX30', 'EX90', 'Polestar Engineered'],
  },
  {
    name: 'Other',
    models: ['Custom'],
  },
];

export const getModelsForBrand = (brandName: string): string[] => {
  const brand = CAR_BRANDS.find((b) => b.name === brandName);
  return brand?.models || [];
};
