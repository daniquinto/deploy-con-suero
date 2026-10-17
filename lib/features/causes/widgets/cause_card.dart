import 'package:flutter/material.dart';

import '../causes_service.dart';

class CauseCard extends StatelessWidget {
  const CauseCard({super.key, required this.cause, required this.onTap});

  final Cause cause;
  final VoidCallback onTap;

  String _money(int value) => '\$${(value / 1000000).toStringAsFixed(1)} M';

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final compact = constraints.maxWidth < 240;
        return Card(
          clipBehavior: Clip.antiAlias,
          elevation: 0,
          color: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
            side: const BorderSide(color: Color(0xFFE6EAF2)),
          ),
          child: InkWell(
            onTap: onTap,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  height: compact ? 112 : 150,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      Image.network(
                        cause.imageUrl,
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) => DecoratedBox(
                          decoration: BoxDecoration(
                            gradient: LinearGradient(colors: cause.colors),
                          ),
                        ),
                      ),
                      DecoratedBox(
                        decoration: BoxDecoration(
                          gradient: LinearGradient(
                            begin: Alignment.topCenter,
                            end: Alignment.bottomCenter,
                            colors: [
                              Colors.black.withValues(alpha: 0.08),
                              Colors.black.withValues(alpha: 0.48),
                            ],
                          ),
                        ),
                      ),
                      Positioned(
                        right: -12,
                        bottom: -20,
                        child: Icon(
                          cause.icon,
                          size: compact ? 110 : 150,
                          color: Colors.white12,
                        ),
                      ),
                      Padding(
                        padding: EdgeInsets.all(compact ? 10 : 18),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Flexible(
                              child: Container(
                                padding: EdgeInsets.symmetric(
                                  horizontal: compact ? 8 : 12,
                                  vertical: compact ? 5 : 7,
                                ),
                                decoration: BoxDecoration(
                                  color: Colors.white.withValues(alpha: 0.92),
                                  borderRadius: BorderRadius.circular(20),
                                ),
                                child: Text(
                                  cause.category,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    fontWeight: FontWeight.w600,
                                    fontSize: compact ? 11 : null,
                                  ),
                                ),
                              ),
                            ),
                            if (!compact)
                              const Icon(
                                Icons.bookmark_border_rounded,
                                color: Colors.white,
                              ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                Expanded(
                  child: Padding(
                    padding: EdgeInsets.all(compact ? 12 : 18),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(
                          height: compact ? 38 : 48,
                          child: Text(
                            cause.title,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style:
                                (compact
                                        ? Theme.of(context).textTheme.titleSmall
                                        : Theme.of(context)
                                              .textTheme
                                              .titleMedium)
                                    ?.copyWith(
                                      fontWeight: FontWeight.w800,
                                      height: 1.2,
                                    ),
                          ),
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            Flexible(
                              child: Text(
                                cause.organization,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  color: const Color(0xFF65708A),
                                  fontSize: compact ? 12 : null,
                                ),
                              ),
                            ),
                            if (cause.isVerified) ...[
                              const SizedBox(width: 4),
                              const Icon(
                                Icons.verified_rounded,
                                size: 17,
                                color: Color(0xFF2675E8),
                              ),
                            ],
                          ],
                        ),
                        const Spacer(),
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: LinearProgressIndicator(
                            value: cause.progress,
                            minHeight: 8,
                            backgroundColor: const Color(0xFFE9EDF5),
                          ),
                        ),
                        const SizedBox(height: 10),
                        if (compact) ...[
                          Text(
                            _money(cause.raised),
                            style: const TextStyle(fontWeight: FontWeight.w800),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '${(cause.progress * 100).round()}% recaudado',
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.primary,
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ] else
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  '${_money(cause.raised)} recaudados',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                              const SizedBox(width: 8),
                              Text(
                                '${(cause.progress * 100).round()}%',
                                style: TextStyle(
                                  color: Theme.of(context).colorScheme.primary,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ],
                          ),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
