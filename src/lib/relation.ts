type toKey<A> = (a: A) => Orderable | undefined;
type Bind<A, B> = (a: A, bs: B[]) => any;
type Foreign<A> = { [id: string]: A };
type Foreigns<A, B> = {
	[key: string]: [Foreign<A>, Foreign<B>];
};
type ByForeign<A, B> = [
	aw: TableWritable<A>,
	aFinder: Finder<A>,
	aChildren: TableChildren<A>,
	a2key: toKey<A>,
	aBind?: Bind<A, B>
];

// Foreign section.
function belongsTo<U>(uw: TableWritable<U>, t2key: toKey<T>, u2key: toKey<U>, key: string) {
	const [uFinder, uChildren] = uw.entagle();
	byForeign([{} as TableWritable<T>, finder, baseChildren, t2key], [uw, uFinder, uChildren, u2key]);
}

function hasMany<U>(
	uw: TableWritable<U>,
	u2key: toKey<U>,
	t2key: toKey<T>,
	uBind: Bind<U, T>,
	tBind: Bind<T, U>
) {
	const [uFinder, uChildren] = uw.entagle();
	byForeign(
		[uw, uFinder, uChildren, u2key, uBind],
		[{} as TableWritable<T>, finder, baseChildren, t2key, tBind]
	);
}

function through<X, Y>(
	xw: TableWritable<X>,
	yw: TableWritable<Y>,
	xBind: (x: X) => any,
	yBind: (y: Y) => any
) {
	const [xFinder, xChildren] = xw.entagle();
	const [yFinder, yChildren] = yw.entagle();
	xChildren['through'] = doIt(xBind);
	yChildren['through'] = doIt(yBind);

	function doIt<A>(bind: (a: A) => any) {
		return { set, add, delBy };
		function set(as: A[]) {
			as.forEach(bind);
		}
		function add(as: A[]) {
			as.forEach(bind);
		}
		function delBy(ids: string[]) {}
	}
}

function byForeign<T, U>(
	[tw, tFinder, tChildren, t2key, tBind]: ByForeign<T, U>,
	[uw, uFinder, uChildren, u2key, uBind]: ByForeign<U, T>
): any {
	const foreign: Foreigns<T, U> = {};

	tChildren['foreign'] = doIt(tEntry);
	uChildren['foreign'] = doIt(uEntry);

	function doIt<A>(bind: (a: A) => any) {
		return { set, add, delBy };
		function set(as: A[]) {
			as.forEach(bind);
		}
		function add(as: A[]) {
			as.forEach(bind);
		}
		function delBy(ids: string[]) {}
	}

	function tEntry(t: T) {
		const key = t2key(t);
		if (!key) return;

		const [ts, us] = (foreign[`${key}`] ||= [{}, {}]);
		ts[tFinder(t) as string] = t;

		binds(ts, us, tBind, uBind);
	}

	function uEntry(u: U) {
		const key = u2key(u);
		if (!key) return;

		const [ts, us] = (foreign[`${key}`] ||= [{}, {}]);
		us[uFinder(u) as string] = u;

		binds(ts, us, tBind, uBind);
	}

	function binds(ts: Foreign<T>, us: Foreign<U>, tBind?: Bind<T, U>, uBind?: Bind<U, T>) {
		const tlist = Object.values(ts);
		const ulist = Object.values(us);

		if (tBind)
			for (const t of tlist) {
				tBind(t, ulist);
			}

		if (uBind)
			for (const u of ulist) {
				uBind(u, tlist);
			}
	}
}
