-- Source: Pregled salda poslovnih partnera, C&H Solution, 07.05.2026
-- Period: 01.01.2026 – 05.05.2026
-- Multi-apartment partners split by payment allocation rule:
--   payment within ±3% of a specific apartment's invoice → assigned to that apartment
--   lump-sum payment → split equally between all apartments of that partner
-- kv/1 + kv/7 (KARANOVIC): 199,000.37 total → 101,531.86 + 97,468.51
-- zh/202 + zh/207 (JELIĆ):   25,101.10 total → 14,168.72 + 10,932.38
-- zh/303 (MIHAJLOVIĆ) and zh/316 (TRNINIĆ): overpaid → outstanding = 0
-- Commercial units (kv/11, zh/15, zh/17, zh/313, zh/314, zh/317): outstanding_override remains NULL

ALTER TABLE residents ADD COLUMN outstanding_override REAL;

UPDATE residents SET outstanding_override = 101531.86 WHERE id = 'res_7eef0a436f'; -- kv/1  Karanović Milorad
UPDATE residents SET outstanding_override = 15820.15  WHERE id = 'res_85b4500eb0'; -- kv/2  Marko Dimitrijević
UPDATE residents SET outstanding_override = 6133.07   WHERE id = 'res_246aa34e87'; -- kv/3  Strahinja Glavonić
UPDATE residents SET outstanding_override = 14289.18  WHERE id = 'res_f92fce5c9f'; -- kv/4  Nikola Vojvodić
UPDATE residents SET outstanding_override = 8367.84   WHERE id = 'res_e7668ab62f'; -- kv/5  Dušan Proroković
UPDATE residents SET outstanding_override = 17498.18  WHERE id = 'res_a38ef81e5f'; -- kv/6  Milan Podovac
UPDATE residents SET outstanding_override = 97468.51  WHERE id = 'res_a34ac0580f'; -- kv/7  Karanović Milorad
UPDATE residents SET outstanding_override = 16250.41  WHERE id = 'res_b8b957364a'; -- kv/8  Nevena Ranisavljević
UPDATE residents SET outstanding_override = 80386.31  WHERE id = 'res_907c1cdd1e'; -- kv/9  Dijana Jović
UPDATE residents SET outstanding_override = 30591.11  WHERE id = 'res_2916ebccc3'; -- kv/10 Lazić Violeta

UPDATE residents SET outstanding_override = 9653.89   WHERE id = 'res_1432e46488'; -- zh/1   Mina Rajković
UPDATE residents SET outstanding_override = 4911.21   WHERE id = 'res_66cc667f51'; -- zh/2   Ana Jovičić
UPDATE residents SET outstanding_override = 8614.75   WHERE id = 'res_f7f3bbd662'; -- zh/3   Vladimir Cvetković
UPDATE residents SET outstanding_override = 5042.65   WHERE id = 'res_df64a18a49'; -- zh/4   Marija Jovičić
UPDATE residents SET outstanding_override = 8433.10   WHERE id = 'res_1f407e5c9a'; -- zh/5   Aleksandar Žeravčić
UPDATE residents SET outstanding_override = 9029.70   WHERE id = 'res_1769dddf39'; -- zh/6   Ivana Jocić
UPDATE residents SET outstanding_override = 5223.11   WHERE id = 'res_7702f3a4f6'; -- zh/7   Goran Jovanović
UPDATE residents SET outstanding_override = 8887.24   WHERE id = 'res_0b4907bb30'; -- zh/8   Stevan Đurić
UPDATE residents SET outstanding_override = 5076.96   WHERE id = 'res_4bae83326c'; -- zh/9   Vladimir Živković
UPDATE residents SET outstanding_override = 12471.14  WHERE id = 'res_f3e08b1d67'; -- zh/10  Marija Tomović
UPDATE residents SET outstanding_override = 5986.97   WHERE id = 'res_2b466f7dfb'; -- zh/11  Biljana Krunić
UPDATE residents SET outstanding_override = 11689.37  WHERE id = 'res_98ee14078d'; -- zh/12  Miroslav Marković
UPDATE residents SET outstanding_override = 23227.22  WHERE id = 'res_8fdf406831'; -- zh/13  Marko Đuković
UPDATE residents SET outstanding_override = 70899.73  WHERE id = 'res_30bd7817a9'; -- zh/14  Čarman Maja
UPDATE residents SET outstanding_override = 7108.22   WHERE id = 'res_12a81de13a'; -- zh/16  Aleksandar Cvetković
UPDATE residents SET outstanding_override = 23025.60  WHERE id = 'res_6b34984fe7'; -- zh/18  Petar Džakula

UPDATE residents SET outstanding_override = 8664.03   WHERE id = 'res_7c5dd89aa1'; -- zh/101 Marija Tadić Stanić
UPDATE residents SET outstanding_override = 7859.38   WHERE id = 'res_c011661337'; -- zh/102 Maja Jovanović
UPDATE residents SET outstanding_override = 8446.65   WHERE id = 'res_7866f013ed'; -- zh/103 Marko Veljanovski
UPDATE residents SET outstanding_override = 17876.10  WHERE id = 'res_9dc4b82d17'; -- zh/104 Ivana Bajović
UPDATE residents SET outstanding_override = 8174.80   WHERE id = 'res_46bba712f4'; -- zh/105 Zoran Đuričić
UPDATE residents SET outstanding_override = 9159.75   WHERE id = 'res_b664f314d8'; -- zh/106 Simona Rajnpreht
UPDATE residents SET outstanding_override = 84721.78  WHERE id = 'res_40a0c5a488'; -- zh/107 Ekaterina Mednikova
UPDATE residents SET outstanding_override = 10837.37  WHERE id = 'res_e3d75de30f'; -- zh/108 Bojana Ružičić
UPDATE residents SET outstanding_override = 4762.06   WHERE id = 'res_7bf242b9a8'; -- zh/109 Dragana Božić i Bojan Polić
UPDATE residents SET outstanding_override = 11323.07  WHERE id = 'res_b572c04600'; -- zh/110 Lazar Stamenić
UPDATE residents SET outstanding_override = 8484.19   WHERE id = 'res_766deff647'; -- zh/111 Vanja Kosanović
UPDATE residents SET outstanding_override = 20587.44  WHERE id = 'res_a35e349d38'; -- zh/112 Ana Arnaut Vučenović
UPDATE residents SET outstanding_override = 10846.98  WHERE id = 'res_f824194083'; -- zh/113 Marija Ždero
UPDATE residents SET outstanding_override = 16863.14  WHERE id = 'res_91615d9343'; -- zh/114 Vladimir Miljković
UPDATE residents SET outstanding_override = 12056.97  WHERE id = 'res_aa4a7d2013'; -- zh/115 Milica i Nikola Prelević
UPDATE residents SET outstanding_override = 13091.49  WHERE id = 'res_fe32446c64'; -- zh/116 Suzana Radić
UPDATE residents SET outstanding_override = 36299.07  WHERE id = 'res_3264b3ea6c'; -- zh/117 Dijana Kaurin
UPDATE residents SET outstanding_override = 11025.17  WHERE id = 'res_8e89c76d4b'; -- zh/118 Dragan i Dragana Bulut

UPDATE residents SET outstanding_override = 8694.05   WHERE id = 'res_f032fbd5d4'; -- zh/201 Nenad Vasić
UPDATE residents SET outstanding_override = 14168.72  WHERE id = 'res_d2df6d9be7'; -- zh/202 Marijana Jelić (split)
UPDATE residents SET outstanding_override = 24315.44  WHERE id = 'res_110bbea87f'; -- zh/203 Saška Cvetković
UPDATE residents SET outstanding_override = 8956.34   WHERE id = 'res_e92233e558'; -- zh/204 Marina Mutić
UPDATE residents SET outstanding_override = 8174.00   WHERE id = 'res_79e8e2c24a'; -- zh/205 Nenad Koković
UPDATE residents SET outstanding_override = 11588.65  WHERE id = 'res_99b1ba1089'; -- zh/206 Stefan Jovanović
UPDATE residents SET outstanding_override = 10932.38  WHERE id = 'res_9d62950c01'; -- zh/207 Marijana Jelić (split)
UPDATE residents SET outstanding_override = 31898.93  WHERE id = 'res_3dc0179eaf'; -- zh/208 Anja Kablar Crnogorac
UPDATE residents SET outstanding_override = 9301.69   WHERE id = 'res_360fa356ae'; -- zh/209 Biserka Nikolić
UPDATE residents SET outstanding_override = 10372.83  WHERE id = 'res_0871894305'; -- zh/210 Aleksandra Živančić
UPDATE residents SET outstanding_override = 8485.43   WHERE id = 'res_d1c7ea67e7'; -- zh/211 Goran Ludoški
UPDATE residents SET outstanding_override = 10245.04  WHERE id = 'res_7482353bc0'; -- zh/212 Olja Milović
UPDATE residents SET outstanding_override = 11070.18  WHERE id = 'res_fdbda22047'; -- zh/213 Dragana Božić (partner 131)
UPDATE residents SET outstanding_override = 8431.56   WHERE id = 'res_5d7c13939c'; -- zh/214 Radmila Pavlica
UPDATE residents SET outstanding_override = 24227.34  WHERE id = 'res_30a8ee39bf'; -- zh/215 Marko Radak
UPDATE residents SET outstanding_override = 13143.86  WHERE id = 'res_10b28b8e72'; -- zh/216 Nikola Kostić
UPDATE residents SET outstanding_override = 11621.31  WHERE id = 'res_205709c005'; -- zh/217 Dragica Vujičić
UPDATE residents SET outstanding_override = 46106.47  WHERE id = 'res_00aa2a7b16'; -- zh/218 Miloš Mandić

UPDATE residents SET outstanding_override = 7461.73   WHERE id = 'res_b4733901ca'; -- zh/301 Lazar Sedlarević
UPDATE residents SET outstanding_override = 7918.92   WHERE id = 'res_32676c54fe'; -- zh/302 Grozda Vasilev
UPDATE residents SET outstanding_override = 0.00      WHERE id = 'res_5161354606'; -- zh/303 Željko Mihajlović (credit)
UPDATE residents SET outstanding_override = 7751.79   WHERE id = 'res_2adeda4ca3'; -- zh/304 Milan Adamović
UPDATE residents SET outstanding_override = 7087.43   WHERE id = 'res_7dfac09f5d'; -- zh/305 Maja Mijić
UPDATE residents SET outstanding_override = 38334.41  WHERE id = 'res_01c0eb28fc'; -- zh/306 Ana Vučković
UPDATE residents SET outstanding_override = 4433.74   WHERE id = 'res_accd854906'; -- zh/307 Milena Đaković
UPDATE residents SET outstanding_override = 7711.13   WHERE id = 'res_bc23da0fd0'; -- zh/308 Barbara Radulović
UPDATE residents SET outstanding_override = 4290.45   WHERE id = 'res_7e322fad1b'; -- zh/309 Nataša Jeličić
UPDATE residents SET outstanding_override = 10409.85  WHERE id = 'res_eb56c954a3'; -- zh/310 Nebojša Vuković
UPDATE residents SET outstanding_override = 173107.93 WHERE id = 'res_073efd319b'; -- zh/311 Nataliya i Sergei Karykhalin
UPDATE residents SET outstanding_override = 7406.05   WHERE id = 'res_7323257b53'; -- zh/312 Milica Mićić
UPDATE residents SET outstanding_override = 22051.10  WHERE id = 'res_ae3444da16'; -- zh/315 Dejan Janković
UPDATE residents SET outstanding_override = 0.00      WHERE id = 'res_52a4a9e776'; -- zh/316 Jelena Trninić (credit)
UPDATE residents SET outstanding_override = 10095.72  WHERE id = 'res_76c3f4e3c5'; -- zh/318 Nikola Tešić
