import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../db/schema";
import { formatISO, subDays } from "date-fns";
import { sql } from "drizzle-orm";

const db = drizzle(postgres(process.env.DATABASE_URL!), {
  schema,
  logger: true,
});

const aWeekAgo = subDays(new Date(), 5);

db.execute(sql`
insert into productos_descripcion_index
select distinct id_producto, productos_descripcion, productos_marca from precios
where id_dataset in (
 SELECT d1.id FROM datasets d1
JOIN (
    SELECT id_comercio, MAX(date) as max_date
    FROM datasets
	WHERE date > ${formatISO(aWeekAgo, { representation: "date" })}
    GROUP BY id_comercio
) d2 ON d1.id_comercio = d2.id_comercio AND d1.date = d2.max_date
ORDER BY d1.id_comercio)
 on conflict do nothing;
`);
